/**
 * Off-Pholio preparation — the stateful part.
 *
 * Mirrors `../event/useEventIntake.js`: the workspace calls this once and
 * branches on `isOffPholio`. Everything that only matters when Pholio is not
 * the carrier — resolving the researched route, building the archive, counting
 * the outbound click, logging what was sent — lives here.
 */

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { talentApi } from '../../../api/talent';
import { briefForSeries } from '../../../content/agencyBriefs';
import { readRoute } from '../../../lib/specRegistry';
import {
  DEFAULT_TRACKER_CHANNEL,
  isTrackerChannel,
} from '../../../../../shared/constants/submissionTracker';
import { PREPARE_PAGE_ID, prepareGaps, todayIso } from './offPholioIntake';

/**
 * Hand the archive to the browser.
 *
 * The response is bytes, not a URL — the server named the files inside it and
 * the filename comes back on the response — so the download is triggered here
 * rather than by navigating somewhere.
 */
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Page composition deliberately does NOT live here — unlike the event variant,
 * whether this is an off-Pholio target is known synchronously from the URL, so
 * `pagesForTarget` stays a pure call in the workspace and the step list never
 * waits on a query.
 */
export function useOffPholioTarget({ seriesId, imageIds = [] }) {
  const queryClient = useQueryClient();
  const isOffPholio = Boolean(seriesId);
  const [exportState, setExportState] = useState(null);
  // The handover takes over the screen once an archive exists, and can be put
  // down to go back and change the set — a second export raises it again.
  const [handoffDismissed, setHandoffDismissed] = useState(false);
  // The Agency Brief is the first thing an off-Pholio target opens to (design
  // §Tier 2) — what applying here actually involves, before any preparation
  // starts. One-way per visit, mirroring `handoffDismissed`: "Start preparing"
  // puts it down and the rest of the flow proceeds underneath it.
  const [briefDismissed, setBriefDismissed] = useState(false);

  const routeQuery = useQuery({
    queryKey: ['spec-registry-route', seriesId],
    queryFn: () => talentApi.getSpecRegistryRoute(seriesId),
    enabled: isOffPholio,
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  const route = useMemo(
    () => (routeQuery.data ? readRoute(routeQuery.data.data ?? routeQuery.data) : null),
    [routeQuery.data],
  );

  const normalizedImageIds = useMemo(
    () => [...new Set((imageIds || []).filter(Boolean).map(String))].sort(),
    [imageIds],
  );

  const prepare = useCallback(async () => {
    if (!seriesId) return;
    setExportState({ status: 'pending' });
    setHandoffDismissed(false);
    try {
      const { blob, filename, fileCount, imageCount } = await talentApi.exportSpecRegistrySet({
        seriesId,
        imageIds: normalizedImageIds,
      });
      saveBlob(blob, filename);
      setExportState({ status: 'done', filename, fileCount, imageCount });
    } catch (error) {
      setExportState({
        status: 'error',
        message: error?.message || 'That set could not be prepared.',
      });
    }
  }, [seriesId, normalizedImageIds]);

  /**
   * Recorded, never blocking. The link opens on its own; if the count fails the
   * talent must still reach the agency's page.
   */
  const recordOutboundClick = useCallback(() => {
    if (!seriesId) return;
    talentApi.recordSpecRegistryOutboundClick(seriesId).catch(() => {});
  }, [seriesId]);

  /**
   * The one thing Pholio cannot see: whether the talent actually sent it.
   *
   * An exported archive is evidence of intent, never of a submission — the
   * sending happens on the agency's own channel, off Pholio entirely. So this
   * is only ever called from an explicit answer to an explicit question.
   */
  const logSubmission = useMutation({
    mutationFn: () =>
      talentApi.logTrackedSubmission({
        agencyName: route?.agencyName,
        seriesId,
        channel: isTrackerChannel(route?.channelType)
          ? route.channelType
          : DEFAULT_TRACKER_CHANNEL,
        submittedOn: todayIso(),
        // Ruling R2: what was sent, as far as Pholio honestly knows it. Images
        // only — the archive's README/STATS/EMAIL packaging is not submission
        // content an agency received.
        sentSummary: {
          revisionId: route?.revisionId ?? null,
          fileCount: exportState?.imageCount ?? exportState?.fileCount ?? null,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracker'] });
    },
  });

  const dismissHandoff = useCallback(() => setHandoffDismissed(true), []);
  const dismissBrief = useCallback(() => setBriefDismissed(true), []);
  // The flow keeps a way back — a talent mid-preparation gets to re-read what
  // the agency asks without abandoning the workspace.
  const reopenBrief = useCallback(() => setBriefDismissed(false), []);

  const gaps = useMemo(
    () => (isOffPholio ? prepareGaps({ filledSlots: normalizedImageIds.length, route }) : []),
    [isOffPholio, normalizedImageIds.length, route],
  );

  return {
    isOffPholio,
    seriesId: seriesId || null,
    route,
    agencyName: route?.agencyName || null,
    // The curated name when an authored brief exists, so the workspace chrome
    // and the brief's own masthead say the same thing about the same house.
    displayName: briefForSeries(seriesId)?.name || route?.agencyName || null,
    isLoading: isOffPholio && routeQuery.isLoading,
    error: isOffPholio ? routeQuery.error : null,
    refetch: routeQuery.refetch,
    pageId: PREPARE_PAGE_ID,
    exportState,
    handoffOpen: exportState?.status === 'done' && !handoffDismissed,
    dismissHandoff,
    // Shown before the rest of the flow, once the route has resolved — see
    // the guard in ApplyExperience.jsx, which only reaches the dossier once
    // this is false.
    briefOpen: isOffPholio && !briefDismissed,
    dismissBrief,
    reopenBrief,
    prepare,
    recordOutboundClick,
    logSubmission,
    gaps,
  };
}

export default useOffPholioTarget;

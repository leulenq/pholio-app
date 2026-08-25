import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { getTalentDossier } from '../api/agency';
import { useTalentActions } from '../hooks/useTalentActions';
import { useAgencyPermissions } from '../hooks/useAgencyPermissions';
import { DossierPlate, StatLine } from '../components/dossier/DossierPlate';
import { ReadoutBand } from '../components/dossier/ReadoutBand';
import { CalendarLine } from '../components/dossier/CalendarLine';
import { DigitalsSet } from '../components/dossier/DigitalsSet';
import { SeasonMemory } from '../components/dossier/SeasonMemory';
import { TheBook } from '../components/dossier/TheBook';
import {
  ProfessionalRecord,
  RepresentationRecord,
} from '../components/dossier/RecordPanels';
import { StandingRail } from '../components/dossier/StandingRail';
import { WorkingRecord } from '../components/dossier/WorkingRecord';
import { DecisionDock } from '../components/dossier/DecisionDock';
import { Sheet } from '../components/dossier/DossierPrimitives';
import { initials, talentName } from '../components/dossier/dossierModel';
import '../components/dossier/dossier.css';

/**
 * The expanded talent view — the Talent Dossier.
 *
 * This is the surface an agent opens when a name matters enough to stop
 * scrolling. It is built as a casting sheet, not a profile page: the plate
 * carries identity and stats the way a comp card does, a band of live
 * readouts answers "where does this stand" without reading, and the working
 * columns carry the package, the record, and the decision.
 *
 * Region order is a booker's order, not a database's:
 *   plate → readouts → package → who they are professionally →
 *   representation → the record, with standing pinned right.
 */

function DossierSkeleton() {
  return (
    <div className="dx dx--loading" aria-busy="true" aria-label="Loading talent dossier">
      <div className="dx-command">
        <span className="dx-skel dx-skel--pill" />
        <span className="dx-skel dx-skel--pill" />
      </div>
      <div className="dx-masthead">
        <div className="dx-masthead__inner">
          <div className="dx-plate">
            <div className="dx-plate__frame"><span className="dx-skel dx-skel--frame" /></div>
            <div className="dx-plate__identity">
              <span className="dx-skel dx-skel--title" />
              <span className="dx-skel dx-skel--line" />
              <span className="dx-skel dx-skel--line" />
            </div>
          </div>
        </div>
      </div>
      <div className="dx-page">
        <div className="dx-statline"><span className="dx-skel dx-skel--strip" /></div>
        <div className="dx-band">
          {[0, 1, 2, 3].map((i) => (
            <div className="dx-readout" key={i}>
              <span className="dx-skel dx-skel--key" />
              <span className="dx-skel dx-skel--val" />
            </div>
          ))}
        </div>
        <div className="dx-body">
          <div className="dx-main"><span className="dx-skel dx-skel--panel" /></div>
          <div className="dx-rail"><span className="dx-skel dx-skel--panel" /></div>
        </div>
      </div>
    </div>
  );
}

function DossierMessage({ title, body, onBack }) {
  return (
    <div className="dx">
      <div className="dx-command">
        <button type="button" className="dx-back" onClick={onBack}>
          <ArrowLeft size={15} aria-hidden /> Back
        </button>
      </div>
      <div className="dx-page">
        <div className="dx-halt">
          <h1 className="dx-halt__title">{title}</h1>
          <p className="dx-halt__body">{body}</p>
        </div>
      </div>
    </div>
  );
}

const HALTS = {
  410: {
    title: 'This submission was withdrawn',
    body: 'The talent withdrew it, and Pholio revoked access to the disclosure package. Nothing from it can be shown.',
  },
  403: {
    title: 'Guardian authorisation required',
    body: 'This talent is under 18. A current guardian authorisation, and the permission to view minor submissions, are both needed before this dossier opens.',
  },
  404: {
    title: 'Submission not found',
    body: 'It may have been removed, or it belongs to another agency.',
  },
};

export default function TalentFullView() {
  const { applicationId } = useParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { can } = useAgencyPermissions();
  const [condensed, setCondensed] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const plateRef = useRef(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['talent-dossier', applicationId],
    queryFn: () => getTalentDossier(applicationId),
    enabled: Boolean(applicationId),
    retry: (count, err) => ![403, 404, 410].includes(err?.status) && count < 2,
  });

  const actions = useTalentActions(applicationId);

  // The command bar condenses once the plate scrolls away, so the name and the
  // decision stay reachable. State, not spectacle.
  useEffect(() => {
    const node = plateRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setCondensed(!entry.isIntersecting),
      { rootMargin: '-72px 0px 0px 0px', threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [data]);

  const jump = useCallback((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [reduce]);

  const images = useMemo(() => data?.images || [], [data]);
  const hero = useMemo(
    () => images.find((img) => img.is_primary) || images[0] || null,
    [images],
  );
  // The next few frames sit under the identity so the book starts reading at
  // the masthead rather than four sections down.
  const strip = useMemo(
    () => images.filter((img) => img !== hero).slice(0, 5),
    [images, hero],
  );

  if (isLoading) return <DossierSkeleton />;

  if (error) {
    const halt = HALTS[error?.status];
    return (
      <DossierMessage
        title={halt?.title || 'This dossier could not be opened'}
        body={halt?.body || error?.message || 'Try again in a moment.'}
        onBack={() => navigate(-1)}
      />
    );
  }
  if (!data) {
    return (
      <DossierMessage
        title="Nothing to show"
        body="This submission returned no data."
        onBack={() => navigate(-1)}
      />
    );
  }

  const { talent, application, standing, availability, representation } = data;
  const name = talentName(talent);

  return (
    <motion.div
      className="dx"
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className={`dx-command${condensed ? ' is-condensed' : ''}`}>
        <button type="button" className="dx-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} aria-hidden /> Back
        </button>

        <div className="dx-command__id" aria-hidden={!condensed}>
          <span className="dx-command__thumb">
            {hero ? <img src={hero.path || hero.url} alt="" /> : <span>{initials(name)}</span>}
          </span>
          <span className="dx-command__name">{name}</span>
        </div>

        <DecisionDock
          applicationId={applicationId}
          status={application?.status}
          slug={talent?.slug}
          compact={condensed}
        />
      </div>

      <div className="dx-masthead" ref={plateRef}>
        <div className="dx-masthead__inner">
          <DossierPlate
            dossier={data}
            hero={hero}
            strip={strip}
            frameCount={images.length}
            onOpenHero={() => setLightboxIndex(hero ? images.indexOf(hero) : 0)}
            onOpenFrame={(frame) => setLightboxIndex(images.indexOf(frame))}
          />
        </div>
      </div>

      <div className="dx-page">
        <StatLine talent={talent} />

        <ReadoutBand dossier={data} onJump={jump} />

        <div className="dx-body">
          <div className="dx-main">
            <SeasonMemory dossier={data} />

            <Sheet
              id="dx-package"
              title="The digitals set"
              aside={
                standing?.board?.name
                  ? `Submitted for ${standing.board.name}`
                  : 'Submitted for general consideration'
              }
            >
              <DigitalsSet
                dossier={data}
                onOpenFrame={(frame) => setLightboxIndex(images.indexOf(frame))}
                onRequestMore={() => actions.requestMore.mutate()}
                onRequestRefresh={() => actions.requestRefresh.mutate()}
                refreshing={actions.requestRefresh.isPending}
                canRequest={can('applications.update_status')}
                requesting={actions.requestMore.isPending}
              />
            </Sheet>

            <Sheet
              id="dx-book"
              title="The book"
              aside={`${images.length} frame${images.length === 1 ? '' : 's'}`}
            >
              <TheBook
                images={images}
                submissionPackage={data.submissionPackage}
                openIndex={lightboxIndex}
                onOpenChange={setLightboxIndex}
              />
            </Sheet>

            <Sheet id="dx-professional" title="The professional record">
              <ProfessionalRecord talent={talent} />
            </Sheet>

            <Sheet id="dx-representation" title="Representation">
              <RepresentationRecord representation={representation} />
            </Sheet>

            <Sheet id="dx-availability" title="Availability">
              <CalendarLine availability={availability} />
            </Sheet>
          </div>

          <StandingRail dossier={data} applicationId={applicationId} />
        </div>

        <Sheet id="dx-log" title="The record" tone="wide">
          <WorkingRecord
            applicationId={applicationId}
            timeline={standing?.timeline}
            canMessage={!(data.identitySource === 'submission' && data.identityClaimed === false)}
          />
        </Sheet>
      </div>
    </motion.div>
  );
}

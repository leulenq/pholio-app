#!/bin/bash
set -e
S=ui-shots
j(){ local out="${@: -1}"; magick "${@:1:$#-1}" -strip -interlace JPEG -sampling-factor 4:2:0 -quality 72 "$out"; }
j $S/01-submissions-grid.png -resize 1600x img/desk.jpg
j $S/02-review-room-stage.png -resize 1600x img/room.jpg
j $S/03-review-room-pass-armed.png -crop 3200x220+0+1780 +repage -resize 1680x img/pass-bar.jpg
j $S/04-review-room-offer-armed.png -crop 3200x220+0+1780 +repage -resize 1680x img/offer-bar.jpg
j $S/09-settings-requirements-builder.png -crop 2144x1560+1056+0 +repage -resize 1100x img/requirements.jpg
j $S/13-event-call-pool.png -crop 2400x1260+600+740 +repage -resize 1400x img/pool.jpg
j $S/17-agency-messages-thread.png -crop 2530x1680+596+300 +repage -resize 1300x img/messages.jpg
j $S/10-submissions-lineup-6.png -resize 1600x img/lineup.jpg
j $S/11-signing-board-wall.png -resize 1600x img/wall.jpg
j $S/12-signing-board-ledger.png -resize 1600x img/ledger.jpg
j $S/18-team-and-roles.png -resize 1600x img/team.jpg
j $S/20-talent-applications-tracker.png -resize 1600x img/history.jpg
j $S/21-talent-apply-board.png -resize 1600x img/apply-board.jpg
j $S/24-talent-apply-review-send.png -resize 1600x img/apply-send.jpg
j $S/15-designer-picks-desktop.png -resize 1600x img/picks.jpg
j $S/14-event-call-designers.png -resize 1600x img/designers.jpg
for f in 05-noaccount-mobile-s01-empty:m-invite 05-noaccount-mobile-s02:m-born 05-noaccount-mobile-s05:m-height 05-noaccount-mobile-s06:m-measure 05-noaccount-mobile-s09:m-email 05-noaccount-mobile-s10:m-photos 05-noaccount-mobile-sent:m-sent 06-eventcall-mobile-s01-empty:m-event 06-eventcall-mobile-s09:m-consent 16-designer-picks-mobile:m-picks 27-claim-page-mobile:m-claim 28-materials-page-mobile:m-materials; do
  j $S/${f%%:*}.png -resize 585x img/${f##*:}.jpg
done

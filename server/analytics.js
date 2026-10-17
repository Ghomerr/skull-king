/* Anonymous game statistics sent to PostHog (EU cloud), same approach as dungeon-escape.

   Enabled only on Render (RENDER env var, set by Render itself) or when POSTHOG_KEY is set,
   so local / test games are never recorded. Events are sent fire-and-forget :
   an analytics outage must never disturb a game.
   No personal data : no player names, no room names. */
const crypto = require('crypto');

// Public project key (the same one is visible in the portfolio page source)
const PUBLIC_KEY = 'phc_CSjdhXvkwezgmnua3YRb6gRfnyetNJqHXBcsEkPw5Fgq';
const KEY = process.env.POSTHOG_KEY || (process.env.RENDER ? PUBLIC_KEY : '');
const HOST = process.env.POSTHOG_HOST || 'https://eu.i.posthog.com';
const ENABLED = !!KEY && typeof fetch === 'function';
const APP = 'skull-king';

function capture(event, gameId, properties) {
    if (!ENABLED) return;
    fetch(HOST + '/i/v0/e/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: KEY,
            event,
            distinct_id: 'game-' + gameId,
            timestamp: new Date().toISOString(),
            properties: Object.assign({
                // Server-side events : no person profile, no GeoIP (it would be Render's location)
                $process_person_profile: false,
                $geoip_disable: true,
                app: APP,
                game_id: gameId
            }, properties)
        })
    }).catch(() => { /* ignored on purpose */ });
}

function minutes(ms) {
    return ms != null ? Math.round(ms / 6000) / 10 : null;
}

// Humans and robots around the table
function players(room) {
    const robots = room.users.filter(u => u.isRobot);
    return {
        joueurs: room.users.length - robots.length,
        robots: robots.length,
        robots_intelligents: robots.filter(u => u.robotType === 'intelligent').length
    };
}

/** Called once every player has joined the game page and the cards are dealt. */
function gameStarted(room) {
    room.analyticsId = crypto.randomUUID();
    room.analyticsStartedAt = Date.now();
    room.analyticsEndSent = false;
    capture('partie_lancee', room.analyticsId, players(room));
}

/** Called when the last fold of the last round has been played. */
function gameEnded(room) {
    if (!room.analyticsId || room.analyticsEndSent) return;
    room.analyticsEndSent = true;
    const scores = room.users.map(u => u.totalScore || 0);
    const winner = room.users.find(u => u.id === room.gameWinner);
    capture('partie_terminee', room.analyticsId, Object.assign(players(room), {
        manches: room.turn,
        duree_min: minutes(Date.now() - room.analyticsStartedAt),
        score_gagnant: Math.max(...scores),
        gagnant_robot: !!(winner && winner.isRobot)
    }));
}

/** Called when a running game is closed before its end (missing players never came back). */
function gameAborted(room, reason) {
    if (!room.analyticsId || room.analyticsEndSent) return;
    room.analyticsEndSent = true;
    capture('partie_abandonnee', room.analyticsId, Object.assign(players(room), {
        raison: reason,
        manche: room.turn,
        duree_min: minutes(Date.now() - room.analyticsStartedAt)
    }));
}

/** Browser-side snippet for the lobby page (served as /analytics.js) : visits, cookieless. */
function clientScript() {
    if (!KEY) return '/* analytics disabled */';
    return '!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);\n' +
        'posthog.init(' + JSON.stringify(KEY) + ', {' +
        ' api_host: ' + JSON.stringify(HOST) + ',' +
        ' cookieless_mode: "always",' +
        ' person_profiles: "identified_only",' +
        ' autocapture: false,' +
        ' disable_session_recording: true' +
        ' });\n' +
        'posthog.register({ app: ' + JSON.stringify(APP) + ' });\n';
}

module.exports = { ENABLED, gameStarted, gameEnded, gameAborted, clientScript };

// GULLHAVEN HUD: health, ammo, money, timer, score, minimap, radio log,
// killfeed with weapon tags, five-column requisition menu, banners, the
// settings panel and the end screen with accuracy, headshots and round history.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    overlay: $('overlay'),
    title: $('overlay-title'),
    copy: $('overlay-copy'),
    stats: $('overlay-stats'),
    board: $('overlay-board'),
    play: $('play'),
    settingsBtn: $('settings-btn'),
    settingsPanel: $('settings-panel'),
    sensSlider: $('sens-slider'),
    sensValue: $('sens-value'),
    volSlider: $('vol-slider'),
    volValue: $('vol-value'),
    settingsClose: $('settings-close'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    ammo: $('ammo'),
    weaponName: $('weapon-name'),
    healthFill: $('health-fill'),
    healthNum: $('health-num'),
    armorNum: $('armor-num'),
    money: $('money-value'),
    timer: $('timer-value'),
    scoreGull: $('score-gull'),
    scoreKeeper: $('score-keeper'),
    roundLabel: $('round-label'),
    aliveGull: $('alive-gull'),
    aliveKeeper: $('alive-keeper'),
    killfeed: $('killfeed'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    hitmarker: $('hitmarker'),
    crosshair: $('crosshair'),
    buyMenu: $('buy-menu'),
    buyGrid: $('buy-grid'),
    buyMoney: $('buy-money'),
    buyEco: $('buy-eco'),
    buyTimer: $('buy-timer'),
    plantBar: $('plant-bar'),
    plantFill: $('plant-fill'),
    plantLabel: $('plant-label'),
    damage: $('damage-flash'),
    damageDir: $('damage-dir'),
    spectate: $('spectate'),
    bombStatus: $('bomb-status'),
    keys: $('keys'),
    minimap: $('minimap'),
    radioLog: $('radio-log'),
    planLine: $('plan-line'),
    grenades: $('grenades-line'),
    flashOverlay: $('flash-overlay'),
  };
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = { mag: -1, reserve: -1, hp: -1, armor: -1, money: -1, timer: '', score: '', grenades: '' };
  const mm = els.minimap ? els.minimap.getContext('2d') : null;
  let mmWalls = [];

  function drawMinimap(data) {
    if (!mm) return;
    const W = 150;
    const H = 118;
    const s = 3.55;
    const ox = (W - 40.4 * s) / 2;
    const oz = (H - 30.4 * s) / 2;
    const X = (x) => ox + (x + 20.2) * s;
    const Z = (z) => oz + (z + 15.2) * s;
    mm.clearRect(0, 0, W, H);
    mm.fillStyle = 'rgba(12, 9, 7, 0.82)';
    mm.fillRect(0, 0, W, H);
    mm.fillStyle = '#6b4a30';
    for (const r of mmWalls) mm.fillRect(X(r.x - r.w / 2), Z(r.z - r.d / 2), r.w * s, r.d * s);
    mm.font = 'bold 11px "Segoe UI", sans-serif';
    mm.textAlign = 'center';
    mm.textBaseline = 'middle';
    for (const [letter, cx, cz, color] of [['A', -13, -10, '#2f9fd6'], ['B', 13, -10, '#ff9a2e']]) {
      mm.beginPath();
      mm.arc(X(cx), Z(cz), 4.5 * s, 0, Math.PI * 2);
      mm.fillStyle = `${color}33`;
      mm.fill();
      mm.strokeStyle = color;
      mm.lineWidth = 1.5;
      mm.stroke();
      mm.fillStyle = color;
      mm.fillText(letter, X(cx), Z(cz));
    }
    if (data.bomb) {
      mm.fillStyle = data.bomb.planted ? '#ff2a1a' : '#7cc8f0';
      mm.fillRect(X(data.bomb.x) - 3, Z(data.bomb.z) - 3, 6, 6);
    }
    if (data.keeper) {
      for (const a of data.keeper) {
        mm.globalAlpha = Math.max(0.25, 1 - a.age / 4);
        mm.fillStyle = '#ff9a2e';
        mm.beginPath();
        mm.arc(X(a.x), Z(a.z), 3, 0, Math.PI * 2);
        mm.fill();
      }
      mm.globalAlpha = 1;
    }
    if (data.gull) {
      mm.fillStyle = '#2f9fd6';
      for (const e of data.gull) {
        mm.beginPath();
        mm.arc(X(e.x), Z(e.z), 3, 0, Math.PI * 2);
        mm.fill();
      }
    }
    if (data.player) {
      const px = X(data.player.x);
      const pz = Z(data.player.z);
      const a = -data.player.yaw;
      mm.save();
      mm.translate(px, pz);
      mm.rotate(a);
      mm.fillStyle = '#ffffff';
      mm.beginPath();
      mm.moveTo(0, -6);
      mm.lineTo(4.5, 5);
      mm.lineTo(-4.5, 5);
      mm.closePath();
      mm.fill();
      mm.restore();
    }
  }

  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }

  function buyCard(id, name, price, note, stat, disabled, onBuy) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'buy-card';
    card.disabled = disabled;
    card.innerHTML = `<b>${name}</b><span>$${price}</span><i>${note}</i>${stat ? `<i>${stat}</i>` : ''}`;
    card.addEventListener('click', () => onBuy(id));
    return card;
  }

  return {
    setMinimapWalls(rects) { mmWalls = rects; },
    setMinimap(data) { drawMinimap(data); },
    setPlan(text) {
      els.planLine.textContent = text;
    },
    setGrenades(counts, hasKit) {
      const text = `4 FRAG ${counts.frag} · 5 SMOKE ${counts.smoke} · 6 FLARE ${counts.flare} · 7 MOLOTOV ${counts.molotov} · 8 GLARE ${counts.glare}${hasKit ? ' · KIT ✓' : ''}`;
      if (text === last.grenades) return;
      last.grenades = text;
      els.grenades.textContent = text;
    },
    radio(text, team) {
      if (!els.radioLog) return;
      const row = document.createElement('div');
      row.className = `radio-row ${team === 'gull' ? 'radio-gull' : 'radio-keeper'}`;
      row.textContent = text;
      els.radioLog.prepend(row);
      while (els.radioLog.children.length > 4) els.radioLog.lastChild.remove();
      setTimeout(() => row.remove(), 15000);
    },
    flash() {
      els.flashOverlay.style.opacity = '0.85';
      setTimeout(() => { els.flashOverlay.style.opacity = '0'; }, 80);
    },
    setAmmo(mag, reserve, name) {
      if (mag === last.mag && reserve === last.reserve) return;
      last.mag = mag;
      last.reserve = reserve;
      els.ammoMag.textContent = String(mag);
      els.ammoReserve.textContent = `/ ${reserve}`;
      els.ammo.classList.toggle('empty', mag === 0);
      if (name) els.weaponName.textContent = name;
    },
    setHealth(hp, armor) {
      if (hp === last.hp && armor === last.armor) return;
      last.hp = hp;
      last.armor = armor;
      els.healthFill.style.width = `${Math.max(0, hp)}%`;
      els.healthFill.classList.toggle('low', hp <= 30);
      els.healthNum.textContent = String(Math.max(0, Math.ceil(hp)));
      els.armorNum.textContent = armor > 0 ? `+${Math.ceil(armor)}` : '';
    },
    setMoney(value) {
      if (value === last.money) return;
      last.money = value;
      els.money.textContent = `$${value}`;
      els.buyMoney.textContent = `$${value}`;
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = phase === 'freeze' ? `BUY ${s}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (text === last.timer) return;
      last.timer = text;
      els.timer.textContent = text;
      els.timer.classList.toggle('urgent', phase === 'live' && s <= 15);
    },
    setScore(gull, keeper, round) {
      const text = `${gull}-${keeper}|${round}`;
      if (text === last.score) return;
      last.score = text;
      els.scoreGull.textContent = String(gull);
      els.scoreKeeper.textContent = String(keeper);
      els.roundLabel.textContent = `ROUND ${round} OF 9`;
    },
    setAlive(gull, keeper) {
      els.aliveGull.textContent = '●'.repeat(gull) + '○'.repeat(Math.max(0, 5 - gull));
      els.aliveKeeper.textContent = '●'.repeat(keeper) + '○'.repeat(Math.max(0, 5 - keeper));
    },
    setBombStatus(text) {
      els.bombStatus.textContent = text;
    },
    killfeed(killer, victim, headshot, killerTeam, weapon = '') {
      const row = document.createElement('div');
      row.className = 'feed-row';
      const k = document.createElement('span');
      k.className = killerTeam === 'gull' ? 'feed-gull' : 'feed-keeper';
      k.textContent = killer;
      const v = document.createElement('span');
      v.className = victim === 'You' ? 'feed-gull' : 'feed-keeper';
      v.textContent = victim;
      row.append(k, document.createTextNode(headshot ? ' ☠ HEAD ' : ' ✕ '), v);
      if (weapon) {
        const w = document.createElement('span');
        w.className = 'feed-weapon';
        w.textContent = ` [${weapon}]`;
        row.append(w);
      }
      els.killfeed.prepend(row);
      while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
      setTimeout(() => row.remove(), 12000);
    },
    hitMarker(killed, holdMs = 90) {
      els.hitmarker.classList.add('on');
      els.hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        els.hitmarker.classList.remove('on');
        els.hitmarker.style.transform = '';
      }, holdMs);
    },
    setCrosshairSpread(px) {
      els.crosshair.style.setProperty('--gap', `${px}px`);
    },
    damageFlash() {
      els.damage.style.opacity = '0.55';
      setTimeout(() => { els.damage.style.opacity = '0'; }, 140);
    },
    damageFrom(angle) {
      if (!els.damageDir) return;
      els.damageDir.style.transform = `rotate(${angle}rad)`;
      show(els.damageDir);
      clearTimeout(this._dirTimer);
      this._dirTimer = setTimeout(() => hide(els.damageDir), 900);
    },
    banner(title, sub, ms = 2600) {
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub;
      show(els.banner);
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => hide(els.banner), ms);
    },
    hideBanner() { hide(els.banner); },
    plantProgress(frac, label) {
      if (frac === null) { hide(els.plantBar); return; }
      show(els.plantBar);
      els.plantFill.style.width = `${Math.round(frac * 100)}%`;
      els.plantLabel.textContent = label;
    },
    showBuy(weapons, money, ownedId, armor, hasKit, grenades = [], ecoLine = '', buySeconds = 5) {
      els.buyGrid.innerHTML = '';
      if (ecoLine) {
        els.buyEco.textContent = ecoLine;
        els.buyEco.hidden = false;
      } else {
        els.buyEco.hidden = true;
      }
      els.buyTimer.textContent = `${buySeconds} S LEFT`;
      const onBuy = (id) => this._onBuy && this._onBuy(id);
      const col = (title) => {
        const div = document.createElement('div');
        div.className = 'buy-col';
        div.innerHTML = `<h3>${title}</h3>`;
        els.buyGrid.appendChild(div);
        return div;
      };
      const c1 = col('1 &nbsp; SIDEARMS');
      for (const w of weapons.filter((x) => x.id === 'puffin')) {
        const owned = w.id === ownedId;
        c1.appendChild(buyCard(w.id, w.name, w.price, owned ? 'EQUIPPED' : w.blurb, `DMG ${w.damage} · ${w.mag}/${w.reserve} · SEMI`, owned || money < w.price, onBuy));
      }
      const c2 = col('2 &nbsp; CLOSE RANGE');
      for (const w of weapons.filter((x) => x.id === 'skua' || x.id === 'cormorant')) {
        const owned = w.id === ownedId;
        const stat = w.pellets > 1 ? `DMG ${w.damage}×${w.pellets} · ${w.mag}/${w.reserve} · PUMP` : `DMG ${w.damage} · ${w.mag}/${w.reserve} · AUTO`;
        c2.appendChild(buyCard(w.id, w.name, w.price, owned ? 'EQUIPPED' : w.blurb, stat, owned || money < w.price, onBuy));
      }
      const c3 = col('3 &nbsp; RIFLES');
      for (const w of weapons.filter((x) => x.id === 'osprey' || x.id === 'albatross')) {
        const owned = w.id === ownedId;
        c3.appendChild(buyCard(w.id, w.name, w.price, owned ? 'EQUIPPED' : w.blurb, `DMG ${w.damage} · ${w.mag}/${w.reserve} · ${w.auto ? 'AUTO' : 'SEMI'}${w.zoom > 1 ? ' · SCOPE' : ''}`, owned || money < w.price, onBuy));
      }
      const c4 = col('4 &nbsp; GEAR');
      c4.appendChild(buyCard('armor', 'Plated Vest', 650, armor > 0 ? 'EQUIPPED' : '50 armour, absorbs half of every hit.', '', armor > 0 || money < 650, onBuy));
      c4.appendChild(buyCard('helmet', 'Vest + Helmet', 1000, armor >= 100 ? 'EQUIPPED' : '100 armour and a helmet.', '', armor >= 100 || money < 1000, onBuy));
      c4.appendChild(buyCard('kit', 'Defuse Kit', 400, hasKit ? 'OWNED' : 'Defuse in 2.5 s instead of 5.', '', hasKit || money < 400, onBuy));
      const c5 = col('5 &nbsp; GRENADES');
      for (const g of grenades) {
        const full = g.count >= 2;
        c5.appendChild(buyCard(g.id, `${g.name} [${g.key}]`, g.price, full ? 'FULL — 2 carried' : g.blurb, '', full || money < g.price, onBuy));
      }
      show(els.buyMenu);
    },
    hideBuy() { hide(els.buyMenu); },
    setSpectate(name) {
      if (!name) { hide(els.spectate); return; }
      els.spectate.textContent = `Spectating ${name} — click to cycle`;
      show(els.spectate);
    },
    showOverlay(mode, score, stats) {
      const COPY = {
        start: { title: 'GULLHAVEN', copy: 'Round-based tactical FPS on Quay 9. Plant the Tide Charge at Lantern Hall or the Cannery, or eliminate the Keeper team. First to 5 rounds takes the quay. Sides switch at halftime — then you defend and defuse.', action: 'Click to play' },
        paused: { title: 'GULLHAVEN', copy: 'Paused. Click to resume.', action: 'Click to resume' },
        dead: { title: 'You are down', copy: 'Your team fights on. Watch a teammate and wait for the next round.', action: 'Spectate' },
        end: { title: 'Match over', copy: `Final score ${score}.`, action: 'Play again' },
      };
      const text = COPY[mode];
      if (!text) return;
      els.title.textContent = (stats && mode === 'end') ? stats.result : text.title;
      els.copy.textContent = text.copy;
      if (stats && mode === 'end') {
        const acc = stats.accuracy ?? 0;
        const hs = stats.headshots ?? 0;
        const dmg = stats.damage ?? 0;
        const hist = stats.history ? ` · Rounds: ${stats.history.split('').join(' ')}` : '';
        els.stats.textContent = `You: ${stats.kills} kills · ${stats.deaths} deaths · $${stats.earned.toLocaleString()} earned — MVP: ${stats.mvp} · ${acc}% accuracy · ${hs} headshots · ${dmg.toLocaleString()} damage${hist}`;
        show(els.stats);
        els.board.textContent = stats.board || '';
        show(els.board);
      } else {
        hide(els.stats);
        hide(els.board);
      }
      els.play.textContent = text.action;
      show(els.overlay);
    },
    hideOverlay() { hide(els.overlay); },
    onPlay(handler) { els.play.addEventListener('click', handler); },
    onBuy(handler) { this._onBuy = handler; },
    onSettings(handler) { if (els.settingsBtn) els.settingsBtn.addEventListener('click', handler); },
    openSettings(current, onChange) {
      if (!els.settingsPanel) return;
      if (els.sensSlider) {
        els.sensSlider.value = String(current.sensitivity);
        if (els.sensValue) els.sensValue.textContent = `${Number(current.sensitivity).toFixed(2)}×`;
      }
      if (els.volSlider) {
        els.volSlider.value = String(current.volume);
        if (els.volValue) els.volValue.textContent = `${Math.round(current.volume * 100)}%`;
      }
      const read = () => {
        const s = {
          sensitivity: els.sensSlider ? Number(els.sensSlider.value) : current.sensitivity,
          volume: els.volSlider ? Number(els.volSlider.value) : current.volume,
        };
        if (els.sensValue) els.sensValue.textContent = `${s.sensitivity.toFixed(2)}×`;
        if (els.volValue) els.volValue.textContent = `${Math.round(s.volume * 100)}%`;
        onChange(s);
      };
      if (els.sensSlider) els.sensSlider.oninput = read;
      if (els.volSlider) els.volSlider.oninput = read;
      if (els.settingsClose) els.settingsClose.onclick = () => hide(els.settingsPanel);
      show(els.settingsPanel);
    },
    closeSettings() { if (els.settingsPanel) hide(els.settingsPanel); },
  };
}

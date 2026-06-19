import {
  PHASES,
  adjustEnergy,
  attack,
  attackPreview,
  canStart,
  createGame,
  hexDistance,
  liveUnits,
  moveRange,
  moveSelectedUnit,
  nextPhase,
  reachableCells,
  rosterCost,
  runComputerTurnSteps,
  selectTarget,
  selectUnit,
  selectedTarget,
  selectedUnit,
  setRoster,
  stallState,
  startBattle,
  useAction,
  useTactic
} from "./game.js";

const app = document.querySelector("#app");

const state = {
  screen: "title",
  aircraft: [],
  cards: null,
  scenarios: [],
  game: null,
  zoom: 1,
  logOpen: false,
  confirmation: null,
  mapScroll: { left: 0, top: 0 },
  suppressMapClick: false,
  effects: {},
  effectTimer: null,
  animatingEnemy: false,
  focusUnitId: null,
  hoverAttackId: null
};

const ZOOM_MIN = 0.7;
const ZOOM_MAX = 1.8;

const phaseLabels = {
  [PHASES.CARD]: "カード使用",
  [PHASES.MOVE]: "移動",
  [PHASES.ATTACK]: "攻撃",
  [PHASES.END]: "ターン終了",
  [PHASES.ENEMY]: "Computerターン",
  [PHASES.GAME_OVER]: "決着"
};

async function init() {
  const [aircraft, cards, scenarios] = await Promise.all([
    fetch("./data/aircraft.json").then((response) => response.json()),
    fetch("./data/cards.json").then((response) => response.json()),
    fetch("./data/scenarios.json").then((response) => response.json())
  ]);
  state.aircraft = aircraft;
  state.cards = cards;
  state.scenarios = scenarios;
  state.game = createGame({ scenario: scenarios[0], aircraft });
  render();
}

function render() {
  if (state.screen === "title") renderTitle();
  if (state.screen === "scenario") renderScenario();
  if (state.screen === "roster") renderRoster();
  if (state.screen === "tutorial") renderTutorial();
  if (state.screen === "battle") renderBattle();
}

function renderTitle() {
  app.innerHTML = `
    <main class="title-screen">
      <section class="title-hero">
        <p class="eyebrow">WW2 AIR COMBAT BOARD GAME</p>
        <h1>第二次世界大戦<br />空戦ボードゲーム</h1>
        <p class="lead">高度を取り、速度を保ち、敵を失速へ追い込むターン制戦術ゲーム。</p>
        <div class="title-actions">
          <button class="primary" data-action="scenario">出撃する</button>
          <button data-action="tutorial">チュートリアル</button>
        </div>
      </section>
    </main>
  `;
  bind("[data-action='scenario']", "click", () => {
    state.screen = "scenario";
    render();
  });
  bind("[data-action='tutorial']", "click", () => {
    state.screen = "tutorial";
    render();
  });
}

function renderScenario() {
  app.innerHTML = `
    <main class="shell">
      ${topBar("シナリオ選択")}
      <section class="scenario-list">
        ${state.scenarios.map((scenario) => `
          <article class="scenario-card">
            <div>
              <p class="eyebrow">SINGLE PLAY</p>
              <h2>${scenario.name}</h2>
              <p>${scenario.description}</p>
            </div>
            <dl class="scenario-stats">
              <div><dt>編成数</dt><dd>${scenario.forceSize}機</dd></div>
              <div><dt>コスト上限</dt><dd>${scenario.costLimit}</dd></div>
              <div><dt>勝利条件</dt><dd>${scenario.victory}</dd></div>
            </dl>
            <button class="primary" data-scenario="${scenario.id}">このシナリオで編成</button>
          </article>
        `).join("")}
      </section>
    </main>
  `;
  bindAll("[data-scenario]", "click", (button) => {
    const scenario = state.scenarios.find((item) => item.id === button.dataset.scenario);
    state.game = createGame({ scenario, aircraft: state.aircraft });
    state.screen = "roster";
    render();
  });
  bindNav();
}

function renderRoster() {
  const game = state.game;
  const counts = countRoster(game.selectedRoster);
  const cost = rosterCost(game);
  app.innerHTML = `
    <main class="shell">
      ${topBar("機体編成")}
      <section class="roster-layout">
        <aside class="briefing-panel">
          <p class="eyebrow">${game.scenario.name}</p>
          <h2>RAF航空隊を編成</h2>
          <p>合計 ${game.scenario.forceSize} 機、コスト ${game.scenario.costLimit} 以内で出撃します。</p>
          <div class="meter-row">
            <span>機数</span>
            <strong>${game.selectedRoster.length} / ${game.scenario.forceSize}</strong>
          </div>
          <div class="meter-row">
            <span>コスト</span>
            <strong class="${cost > game.scenario.costLimit ? "danger" : ""}">${cost} / ${game.scenario.costLimit}</strong>
          </div>
          <button class="primary wide" data-action="start" ${canStart(game) ? "" : "disabled"}>出撃開始</button>
        </aside>
        <section class="aircraft-grid">
          ${game.playerRoster.map((plane) => `
            <article class="aircraft-card">
              <div>
                <p class="eyebrow">${plane.type}</p>
                <h3>${plane.name}</h3>
              </div>
              <div class="stat-grid">
                <span><small>MaxHP</small><strong>${plane.stats.maxHP}</strong></span>
                <span><small>MaxSPD</small><strong>${plane.stats.maxSPD}</strong></span>
                <span><small>ATK</small><strong>${plane.stats.atk}</strong></span>
                <span><small>AGI</small><strong>${plane.stats.agi}</strong></span>
              </div>
              <div class="counter">
                <button data-remove="${plane.id}" aria-label="${plane.name}を外す">−</button>
                <strong>${counts[plane.id] ?? 0}</strong>
                <button data-add="${plane.id}" aria-label="${plane.name}を加える">＋</button>
              </div>
            </article>
          `).join("")}
        </section>
      </section>
    </main>
  `;
  bindAll("[data-add]", "click", (button) => {
    state.game = setRoster(state.game, button.dataset.add, 1);
    render();
  });
  bindAll("[data-remove]", "click", (button) => {
    state.game = setRoster(state.game, button.dataset.remove, -1);
    render();
  });
  bind("[data-action='start']", "click", () => {
    state.game = startBattle(state.game);
    state.screen = "battle";
    state.focusUnitId = state.game.selectedUnitId;
    render();
  });
  bindNav();
}

function renderTutorial() {
  app.innerHTML = `
    <main class="shell">
      ${topBar("チュートリアル")}
      <section class="tutorial">
        <article>
          <h2>勝ち筋はHPではなく、位置とエネルギー</h2>
          <p>SPDが高いほど移動距離が伸び、ALTが高いほど垂直一撃離脱が強くなります。</p>
        </article>
        <article>
          <h2>失速に注意</h2>
          <p>SPD ≤ ALT で軽失速、SPD ≤ ALT-3 で重失速です。重失速中は横旋回戦が使えず、一撃離脱の的になります。</p>
        </article>
        <article>
          <h2>ターン終了の調整</h2>
          <p>SPDかALTを1変化できます。さらに ALT-1 → SPD+2 の急降下変換で速度を作れます。</p>
        </article>
        <button class="primary" data-action="scenario">シナリオへ</button>
      </section>
    </main>
  `;
  bind("[data-action='scenario']", "click", () => {
    state.screen = "scenario";
    render();
  });
  bindNav();
}

function renderBattle() {
  const game = state.game;
  const preservedScroll = readMapScroll();
  state.mapScroll = preservedScroll;
  app.innerHTML = `
    <main class="battle-shell map-first">
      <header class="battle-top map-overlay top-hud">
        <div>
          <p class="eyebrow">${game.scenario.name}</p>
          <h1>${phaseLabels[game.phase]} / Turn ${game.turn}</h1>
        </div>
        <div class="top-actions">
          <button data-action="zoom-out" title="縮小">−</button>
          <span data-zoom-label>${Math.round(state.zoom * 100)}%</span>
          <button data-action="zoom-in" title="拡大">＋</button>
          <button data-action="reset">タイトル</button>
        </div>
      </header>

      <section class="map-panel map-panel-full">
        <div class="cloud-map" style="--zoom: ${state.zoom}">
          ${renderBoard(game)}
        </div>
      </section>

      ${renderBottomTabs(game)}
      ${renderLogDrawer(game)}
      ${state.confirmation ? renderConfirmation(state.confirmation) : ""}
    </main>
  `;
  bindBattle();
  restoreMapScroll(preservedScroll);
  focusUnitOnMap(state.focusUnitId);
  state.focusUnitId = null;
}

function renderConfirmation(confirmation) {
  return `
    <section class="confirm-shade">
      <div class="confirm-box">
        <h2>確認</h2>
        <p>${confirmation.message}</p>
        <div class="confirm-actions">
          <button data-action="confirm-no">いいえ</button>
          <button class="primary" data-action="confirm-yes">はい</button>
        </div>
      </div>
    </section>
  `;
}

function renderBottomTabs(game) {
  const unit = selectedUnit(game);
  const target = selectedTarget(game);
  const steps = [
    [PHASES.CARD, "カード"],
    [PHASES.MOVE, "移動"],
    [PHASES.ATTACK, "攻撃"],
    [PHASES.END, "調整"],
    [PHASES.ENEMY, "Computer"]
  ];

  return `
    <section class="bottom-dock">
      <div class="phase-tabs">
        ${steps.map(([phase, label]) => `
          <span class="phase-tab ${game.phase === phase ? "active" : ""}">${label}</span>
        `).join("")}
      </div>
      <div class="selection-strip">
        <span>選択: <strong>${unit?.name ?? "なし"}</strong></span>
        <span>標的: <strong>${target?.name ?? "なし"}</strong></span>
        ${unit ? `<span>距離: <strong>${target ? hexDistance(unit, target) : "-"}</strong></span>` : ""}
      </div>
      ${renderPhaseControls(game, unit, target)}
    </section>
  `;
}

function renderLogDrawer(game) {
  return `
    <section class="log-drawer ${state.logOpen ? "open" : ""}">
      <button class="log-toggle" data-action="toggle-log">${state.logOpen ? "ログを隠す" : "ログ"}</button>
      <div class="log-panel">
        <h2>行動ログ</h2>
        ${game.log.map((item) => `<p>${item}</p>`).join("")}
      </div>
    </section>
  `;
}

function renderUnitPanel(label, unit) {
  if (!unit) {
    return `<section class="unit-panel"><h2>${label}</h2><p>なし</p></section>`;
  }
  const stall = stallState(unit);
  return `
    <section class="unit-panel ${unit.side}">
      <h2>${label}</h2>
      <div class="unit-heading">
        <strong>${unit.name}</strong>
        <span>${unit.type}</span>
      </div>
      <div class="hp-line"><span style="width:${(unit.hp / unit.maxHP) * 100}%"></span></div>
      <div class="unit-readout">
        <span>HP ${unit.hp}/${unit.maxHP}</span>
        <span>ATK ${unit.atk}</span>
        <span>AGI ${unit.agi}</span>
      </div>
      <div class="gauge-row">
        ${gauge("ALT", unit.alt, 10)}
        ${gauge("SPD", unit.spd, Math.max(10, unit.maxSPD + 3), unit.spd > unit.maxSPD)}
      </div>
      <p class="stall ${stall}">${stallLabel(stall)}</p>
      <div class="used-tags">
        ${unit.movedThisTurn ? "<span>移動済み</span>" : ""}
        ${unit.attackedThisTurn ? "<span>攻撃済み</span>" : ""}
        ${unit.adjustedEnergyThisTurn ? "<span>調整済み</span>" : ""}
      </div>
    </section>
  `;
}

function renderSquadList(game) {
  return `
    <section class="squad-list">
      <h2>航空隊</h2>
      ${["player", "enemy"].map((side) => `
        <div class="side-list">
          <p class="eyebrow">${side === "player" ? "RAF" : "Computer / Luftwaffe"}</p>
          ${game.units.filter((unit) => unit.side === side).map((unit) => `
            <button class="unit-chip ${unit.hp <= 0 ? "down" : ""} ${game.selectedUnitId === unit.id || game.selectedTargetId === unit.id ? "active" : ""}"
              data-${side === "player" ? "unit" : "target"}="${unit.id}" ${unit.hp <= 0 ? "disabled" : ""}>
              <span>${unit.name}</span><strong>${unit.hp}</strong>
            </button>
          `).join("")}
        </div>
      `).join("")}
    </section>
  `;
}

function renderPhaseControls(game, unit, target) {
  if (game.phase === PHASES.GAME_OVER) {
    return `
      <section class="controls-card result-card">
        <h2>${game.winner === "player" ? "勝利" : "敗北"}</h2>
        <p>${game.winner === "player" ? "敵航空隊を撃破しました。" : "航空隊が撃破されました。"}</p>
        <button class="primary wide" data-action="new-battle">再編成する</button>
      </section>
    `;
  }

  if (game.phase === PHASES.CARD) {
    return `
      <section class="controls-card">
        <h2>カード使用</h2>
        <div class="button-grid">
          ${state.cards.tactics.map((card) => `<button data-tactic="${card.id}" title="${card.description}">${card.name}</button>`).join("")}
          ${state.cards.actions.map((card) => `<button data-action-card="${card.id}" title="${card.description}">${card.name}</button>`).join("")}
        </div>
        <button class="primary wide" data-action="next-phase">移動へ</button>
      </section>
    `;
  }

  if (game.phase === PHASES.MOVE) {
    return `
      <section class="controls-card">
        <h2>移動</h2>
        <p>${unit ? (unit.movedThisTurn ? `${unit.name} はこのターン移動済みです。` : `${unit.name} は最大 ${moveRange(unit)} マス移動できます。`) : "機体を選択してください。"}</p>
        <button class="primary wide" data-action="next-phase">攻撃へ</button>
      </section>
    `;
  }

  if (game.phase === PHASES.ATTACK) {
    return `
      <section class="controls-card">
        <h2>攻撃カード</h2>
        <p>${unit && target ? (unit.attackedThisTurn ? `${unit.name} はこのターン攻撃済みです。` : `距離 ${hexDistance(unit, target)} / 標的 ${target.name}`) : "攻撃機と標的を選択してください。"}</p>
        <div class="attack-list">
          ${state.cards.attacks.map((card) => {
            const preview = unit && target ? attackPreview(unit, target, card.id) : { usable: false, reason: "未選択" };
            const disabled = unit?.attackedThisTurn;
            return `
              <button class="${disabled ? "disabled-card" : ""} ${state.hoverAttackId === card.id ? "preview-card" : ""}" data-attack="${card.id}" ${disabled ? "disabled" : ""} title="${unit?.attackedThisTurn ? "このターン攻撃済みです。" : preview.usable ? card.description : preview.reason}">
                <span>${card.name}</span>
                <strong>${unit?.attackedThisTurn ? "済" : preview.usable ? attackDamageLabel(preview) : "不可"}</strong>
              </button>
            `;
          }).join("")}
        </div>
        <button class="primary wide" data-action="next-phase">ターン終了へ</button>
      </section>
    `;
  }

  if (game.phase === PHASES.ENEMY) {
    return `
      <section class="controls-card computer-card">
        <h2>Computer行動</h2>
        <p>${state.animatingEnemy ? "Computer行動中。敵機の動きとゲージ変化を順番に表示しています。" : "Computerは1機ずつ接近・上昇・攻撃します。この間、RAF機の移動はできません。"}</p>
        <button class="primary wide" data-action="next-phase" ${state.animatingEnemy ? "disabled" : ""}>${state.animatingEnemy ? "Computer行動中" : "Computer行動を実行"}</button>
      </section>
    `;

    return `
      <section class="controls-card computer-card">
        <h2>Computer行動</h2>
        <p>Computerは接近しながら高度を取り、垂直・水平一撃離脱を優先します。この間、RAF機は移動できません。</p>
        <button class="primary wide" data-action="next-phase">Computer行動を実行</button>
      </section>
    `;
  }

  return `
    <section class="controls-card">
      <h2>エネルギー調整</h2>
      <p>${unit?.adjustedEnergyThisTurn ? "この駒はこのターンすでにALT/SPDを調整済みです。" : "選択中の駒だけ、1ターンに1回調整できます。"}</p>
      <div class="button-grid">
        <button data-energy="spd-up" ${unit?.adjustedEnergyThisTurn ? "disabled" : ""}>SPD +1</button>
        <button data-energy="spd-down" ${unit?.adjustedEnergyThisTurn ? "disabled" : ""}>SPD -1</button>
        <button data-energy="alt-up" ${unit?.adjustedEnergyThisTurn ? "disabled" : ""}>ALT +1</button>
        <button data-energy="alt-down" ${unit?.adjustedEnergyThisTurn ? "disabled" : ""}>ALT -1</button>
        <button data-energy="dive" ${unit?.adjustedEnergyThisTurn ? "disabled" : ""}>ALT -1 → SPD +2</button>
      </div>
      <button class="primary wide" data-action="next-phase">Computerターンへ</button>
    </section>
  `;
}

function renderBoard(game) {
  const unit = selectedUnit(game);
  const reachable = new Set(reachableCells(game, unit).map((cell) => `${cell.q},${cell.r}`));
  const width = game.scenario.map.width;
  const height = game.scenario.map.height;
  const attackPlan = attackPlanPreview(game);
  return `
    <div class="hex-board" style="--cols:${width}; --rows:${height}">
      ${game.board.map((cell) => {
        const occupant = game.units.find((item) => item.hp > 0 && item.q === cell.q && item.r === cell.r);
        const key = `${cell.q},${cell.r}`;
        return `
          <button class="hex ${cell.cloud ? "cloud" : ""} ${reachable.has(key) && game.phase === PHASES.MOVE ? "reachable" : ""}"
            data-cell-q="${cell.q}" data-cell-r="${cell.r}"
            style="grid-column:${cell.q + 1}; grid-row:${cell.r + 1}; transform: translateX(${cell.r % 2 ? 24 : 0}px);">
            ${occupant ? renderPlaneToken(game, occupant, attackPlan) : ""}
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderPlaneToken(game, unit, attackPlan) {
  const selected = game.selectedUnitId === unit.id || game.selectedTargetId === unit.id;
  const spotlight = state.focusUnitId === unit.id;
  const attackPlanned = attackPlan.unitIds.has(unit.id);
  const plannedEffects = attackPlan.effects;
  return `
    <span class="plane-token ${unit.side} ${selected ? "selected" : ""} ${spotlight ? "spotlight" : ""} ${attackPlanned ? "attack-previewed" : ""}" data-token-id="${unit.id}" data-${unit.side === "player" ? "unit" : "target"}="${unit.id}">
      <span class="token-status">
        ${tokenGauge(unit.id, "HP", unit.hp, unit.maxHP, null, plannedEffects)}
        ${tokenGauge(unit.id, "ALT", unit.alt, 10, null, plannedEffects)}
        ${tokenGauge(unit.id, "SPD", unit.spd, Math.max(10, unit.maxSPD + 3, unit.spd), unit.maxSPD, plannedEffects)}
      </span>
      <span class="plane-arrow" style="transform: rotate(${unit.facing * 60}deg)">▲</span>
      <span>${unit.name.replace(" Mk Ia", "").replace("F-4", "")}</span>
      <span class="plane-tooltip">
        <strong>${unit.name}</strong>
        <em>${unit.type}</em>
        <span>MaxHP ${unit.maxHP}</span>
        <span>MaxSPD ${unit.maxSPD}</span>
        <span>ATK ${unit.atk}</span>
        <span>AGI ${unit.agi}</span>
        <span>${stallLabel(stallState(unit))}</span>
      </span>
    </span>
  `;
}

function tokenGauge(unitId, label, value, max, limit = null, plannedEffects = {}) {
  const width = Math.min(100, (value / max) * 100);
  const key = `${unitId}:${label.toLowerCase()}`;
  const effect = state.effects[key] ?? plannedEffects[key];
  const limitWidth = limit ? Math.min(100, (limit / max) * 100) : null;
  const normalWidth = limit ? Math.min(width, limitWidth) : width;
  const overspeedWidth = limit ? Math.max(0, width - limitWidth) : 0;
  return `
    <span class="token-gauge ${label.toLowerCase()} ${overspeedWidth > 0 ? "overspeed" : ""}" style="${limitWidth ? `--limit:${limitWidth}%` : ""}">
      <span>${label}</span>
      <i>
        <b style="width:${normalWidth}%"></b>
        ${overspeedWidth > 0 ? `<small class="overspeed-part" style="left:${limitWidth}%; width:${overspeedWidth}%"></small>` : ""}
        ${limitWidth ? `<small class="maxspd-mark" style="left:${limitWidth}%"></small>` : ""}
        ${effect ? `<em class="gauge-change ${effect.direction} ${effect.kind ?? ""}" style="left:${effect.left}%; width:${effect.width}%"></em>` : ""}
      </i>
      <strong>${value}</strong>
    </span>
  `;
}

function readMapScroll() {
  const panel = app.querySelector(".map-panel-full");
  if (!panel) return state.mapScroll;
  return { left: panel.scrollLeft, top: panel.scrollTop };
}

function restoreMapScroll(scroll) {
  const panel = app.querySelector(".map-panel-full");
  if (!panel) return;
  requestAnimationFrame(() => {
    panel.scrollLeft = scroll.left;
    panel.scrollTop = scroll.top;
  });
}

function pendingPhaseMessage(game) {
  if (!game || game.phase === PHASES.GAME_OVER || game.phase === PHASES.ENEMY) return null;

  const playerUnits = liveUnits(game, "player");

  if (game.phase === PHASES.MOVE) {
    const pending = playerUnits.filter((unit) => !unit.movedThisTurn);
    if (pending.length) {
      return `まだ移動していない機体が ${pending.length} 機あります。次の攻撃フェーズへ進みますか？`;
    }
  }

  if (game.phase === PHASES.ATTACK) {
    const pending = playerUnits.filter((unit) => !unit.attackedThisTurn && canUnitAttack(game, unit));
    if (pending.length) {
      return `まだ攻撃可能な機体が ${pending.length} 機あります。ターン終了へ進みますか？`;
    }
  }

  if (game.phase === PHASES.END) {
    const pending = playerUnits.filter((unit) => !unit.adjustedEnergyThisTurn);
    if (pending.length) {
      return `まだALT/SPD調整をしていない機体が ${pending.length} 機あります。Computerターンへ進みますか？`;
    }
  }

  return null;
}

function canUnitAttack(game, unit) {
  return liveUnits(game, "enemy").some((target) =>
    state.cards.attacks.some((card) => attackPreview(unit, target, card.id).usable)
  );
}

function attackDamageLabel(preview) {
  if (preview.selfDamage > 0) return `${preview.damage} dmg / 反${preview.selfDamage}`;
  return `${preview.damage} dmg`;
}

function attackPlanPreview(game) {
  const empty = { effects: {}, unitIds: new Set() };
  if (!game || game.phase !== PHASES.ATTACK || !state.hoverAttackId) return empty;

  const attacker = selectedUnit(game);
  const target = selectedTarget(game);
  if (!attacker || !target || attacker.attackedThisTurn) return empty;

  const preview = attackPreview(attacker, target, state.hoverAttackId);
  if (!preview.usable) return empty;

  const effects = {};
  const unitIds = new Set([attacker.id, target.id]);
  const nextAttacker = { ...attacker };
  const nextTarget = { ...target };
  const targetDamage = Math.max(0, preview.damage - target.defense);
  const selfDamage = Math.max(0, (preview.selfDamage ?? 0) - attacker.defense);
  nextTarget.hp = Math.max(0, target.hp - targetDamage);

  if (state.hoverAttackId === "vertical-boom-zoom") {
    const altDrop = Math.max(0, attacker.alt - target.alt);
    nextAttacker.alt = target.alt;
    nextAttacker.spd += altDrop * 2;
  }
  if (state.hoverAttackId === "turn-fight") {
    nextAttacker.spd = Math.max(0, attacker.spd - 2);
  }
  if (state.hoverAttackId === "vertical-turn") {
    nextAttacker.alt = Math.max(0, attacker.alt - 1);
    nextAttacker.spd = Math.max(0, attacker.spd - 1);
  }
  if (selfDamage > 0) {
    nextAttacker.hp = Math.max(0, attacker.hp - selfDamage);
  }

  addUnitGaugeEffects(effects, attacker, nextAttacker, "preview");
  addUnitGaugeEffects(effects, target, nextTarget, "preview");
  return { effects, unitIds };
}

function addUnitGaugeEffects(effects, before, after, kind = "actual") {
  addGaugeEffect(effects, before.id, "hp", before.hp, after.hp, before.maxHP, kind);
  addGaugeEffect(effects, before.id, "alt", before.alt, after.alt, 10, kind);
  addGaugeEffect(effects, before.id, "spd", before.spd, after.spd, Math.max(10, before.maxSPD + 3, before.spd, after.spd), kind);
}

function commitGame(nextGame, options = {}) {
  const previousGame = state.game;
  state.hoverAttackId = null;
  state.effects = options.effects === false ? {} : buildGaugeEffects(previousGame, nextGame);
  state.game = nextGame;
  if (options.focusUnitId) state.focusUnitId = options.focusUnitId;
  render();
  scheduleEffectClear();
}

function buildGaugeEffects(previousGame, nextGame) {
  if (!previousGame || !nextGame) return {};
  const previousById = Object.fromEntries(previousGame.units.map((unit) => [unit.id, unit]));
  const effects = {};
  for (const unit of nextGame.units) {
    const before = previousById[unit.id];
    if (!before) continue;
    addUnitGaugeEffects(effects, before, unit);
  }
  return effects;
}

function addGaugeEffect(effects, unitId, label, from, to, max, kind = "actual") {
  if (from === to) return;
  const fromWidth = Math.min(100, (from / max) * 100);
  const toWidth = Math.min(100, (to / max) * 100);
  effects[`${unitId}:${label}`] = {
    direction: to > from ? "increase" : "decrease",
    kind,
    left: Math.min(fromWidth, toWidth),
    width: Math.max(5, Math.abs(toWidth - fromWidth))
  };
}

function scheduleEffectClear() {
  if (state.effectTimer) clearTimeout(state.effectTimer);
  if (!Object.keys(state.effects).length) return;
  state.effectTimer = setTimeout(() => {
    state.effects = {};
    state.effectTimer = null;
    if (state.screen === "battle") render();
  }, 1000);
}

function focusUnitOnMap(unitId) {
  if (!unitId) return;
  const token = app.querySelector(`[data-token-id="${unitId}"]`);
  if (!token) return;
  requestAnimationFrame(() => {
    token.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setHoverAttack(attackId) {
  if (state.hoverAttackId === attackId) return;
  state.hoverAttackId = attackId;
  if (state.screen === "battle") render();
}

async function playComputerTurn() {
  if (state.animatingEnemy || state.game.phase !== PHASES.ENEMY) return;
  state.animatingEnemy = true;
  render();
  const steps = runComputerTurnSteps(state.game);
  for (const step of steps) {
    await wait(step.type === "move" ? 360 : 560);
    commitGame(step.game, { focusUnitId: step.unitId });
  }
  state.animatingEnemy = false;
  render();
}

function bindBattle() {
  bindMapPanning();
  bindAll("[data-unit]", "click", (button, event) => {
    event.stopPropagation();
    state.game = selectUnit(state.game, button.dataset.unit);
    render();
  });
  bindAll("[data-target]", "click", (button, event) => {
    event.stopPropagation();
    state.game = selectTarget(state.game, button.dataset.target);
    render();
  });
  bindAll("[data-cell-q]", "click", (button) => {
    commitGame(moveSelectedUnit(
      state.game,
      Number(button.dataset.cellQ),
      Number(button.dataset.cellR)
    ));
  });
  bindAll("[data-tactic]", "click", (button) => {
    commitGame(useTactic(state.game, button.dataset.tactic));
  });
  bindAll("[data-action-card]", "click", (button) => {
    commitGame(useAction(state.game, button.dataset.actionCard));
  });
  bindAll("[data-attack]", "click", (button) => {
    state.hoverAttackId = null;
    commitGame(attack(state.game, button.dataset.attack));
  });
  bindAll("[data-attack]", "mouseenter", (button) => {
    setHoverAttack(button.dataset.attack);
  });
  bindAll("[data-attack]", "focus", (button) => {
    setHoverAttack(button.dataset.attack);
  });
  bindAll("[data-attack]", "mouseleave", () => {
    setHoverAttack(null);
  });
  bindAll("[data-attack]", "blur", () => {
    setHoverAttack(null);
  });
  bindAll("[data-energy]", "click", (button) => {
    commitGame(adjustEnergy(state.game, button.dataset.energy));
  });
  bind("[data-action='next-phase']", "click", () => {
    if (state.game.phase === PHASES.ENEMY) {
      playComputerTurn();
      return;
    }
    const message = pendingPhaseMessage(state.game);
    if (message) {
      state.confirmation = { message };
      render();
      return;
    }
    commitGame(nextPhase(state.game), { effects: false });
  });
  bind("[data-action='confirm-yes']", "click", () => {
    state.confirmation = null;
    commitGame(nextPhase(state.game), { effects: false });
  });
  bind("[data-action='confirm-no']", "click", () => {
    state.confirmation = null;
    render();
  });
  bind("[data-action='zoom-in']", "click", () => {
    setMapZoom(state.zoom + 0.1);
    render();
  });
  bind("[data-action='zoom-out']", "click", () => {
    setMapZoom(state.zoom - 0.1);
    render();
  });
  bind("[data-action='reset']", "click", () => {
    state.screen = "title";
    render();
  });
  bind("[data-action='toggle-log']", "click", () => {
    state.logOpen = !state.logOpen;
    render();
  });
  bind("[data-action='new-battle']", "click", () => {
    state.game = createGame({ scenario: state.game.scenario, aircraft: state.aircraft });
    state.screen = "roster";
    render();
  });
}

function bindMapPanning() {
  const panel = app.querySelector(".map-panel-full");
  if (!panel) return;

  let isPanning = false;
  let didPan = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  const activePointers = new Map();
  let pinchStartDistance = 0;
  let pinchStartZoom = state.zoom;
  let pinchStartScroll = { left: 0, top: 0 };
  let gestureStartZoom = state.zoom;

  panel.addEventListener("scroll", () => {
    state.mapScroll = { left: panel.scrollLeft, top: panel.scrollTop };
  });

  panel.addEventListener("click", (event) => {
    if (!state.suppressMapClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.suppressMapClick = false;
  }, true);

  panel.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.size === 2) {
      const points = [...activePointers.values()];
      pinchStartDistance = pointerDistance(points[0], points[1]);
      pinchStartZoom = state.zoom;
      pinchStartScroll = { left: panel.scrollLeft, top: panel.scrollTop };
      isPanning = false;
      didPan = true;
      panel.classList.add("panning");
      return;
    }
    isPanning = true;
    didPan = false;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = panel.scrollLeft;
    startTop = panel.scrollTop;
    panel.classList.add("panning");
  });

  panel.addEventListener("pointermove", (event) => {
    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (activePointers.size >= 2 && pinchStartDistance > 0) {
      const points = [...activePointers.values()];
      const distance = pointerDistance(points[0], points[1]);
      const nextZoom = pinchStartZoom * (distance / pinchStartDistance);
      state.mapScroll = pinchStartScroll;
      setMapZoom(nextZoom, { live: true });
      event.preventDefault();
      return;
    }
    if (!isPanning) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPan = true;
    if (!didPan) return;
    event.preventDefault();
    panel.scrollLeft = startLeft - dx;
    panel.scrollTop = startTop - dy;
    state.mapScroll = { left: panel.scrollLeft, top: panel.scrollTop };
  });

  const endPan = (event) => {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) {
      pinchStartDistance = 0;
    }
    if (!isPanning) return;
    isPanning = false;
    panel.classList.remove("panning");
    if (didPan) {
      state.suppressMapClick = true;
      setTimeout(() => {
        state.suppressMapClick = false;
      }, 0);
    }
  };

  panel.addEventListener("pointerup", endPan);
  panel.addEventListener("pointercancel", endPan);

  panel.addEventListener("wheel", (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setMapZoom(state.zoom + direction * 0.08, { live: true });
  }, { passive: false });

  panel.addEventListener("gesturestart", (event) => {
    event.preventDefault();
    gestureStartZoom = state.zoom;
  });

  panel.addEventListener("gesturechange", (event) => {
    event.preventDefault();
    setMapZoom(gestureStartZoom * event.scale, { live: true });
  });
}

function setMapZoom(value, options = {}) {
  const previousZoom = state.zoom;
  const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(value.toFixed(2))));
  if (nextZoom === previousZoom) return;
  const panel = app.querySelector(".map-panel-full");
  const scroll = panel ? { left: panel.scrollLeft, top: panel.scrollTop } : state.mapScroll;
  const ratio = nextZoom / previousZoom;
  state.mapScroll = {
    left: Math.max(0, scroll.left * ratio),
    top: Math.max(0, scroll.top * ratio)
  };
  state.zoom = nextZoom;
  if (options.live) {
    const cloudMap = app.querySelector(".cloud-map");
    const label = app.querySelector("[data-zoom-label]");
    if (cloudMap) cloudMap.style.setProperty("--zoom", String(nextZoom));
    if (label) label.textContent = `${Math.round(nextZoom * 100)}%`;
    if (panel) {
      requestAnimationFrame(() => {
        panel.scrollLeft = state.mapScroll.left;
        panel.scrollTop = state.mapScroll.top;
      });
    }
  }
}

function pointerDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function gauge(label, value, max, warning = false) {
  const width = Math.min(100, (value / max) * 100);
  return `
    <div class="gauge ${label.toLowerCase()} ${warning ? "warning" : ""}">
      <div class="gauge-label"><span>${label}</span><strong>${value}</strong></div>
      <div class="gauge-track"><span style="width:${width}%"></span></div>
    </div>
  `;
}

function topBar(title) {
  return `
    <header class="top-bar">
      <button class="ghost" data-nav="title">タイトル</button>
      <h1>${title}</h1>
      <button class="ghost" data-nav="tutorial">遊び方</button>
    </header>
  `;
}

function bindNav() {
  bindAll("[data-nav]", "click", (button) => {
    state.screen = button.dataset.nav;
    render();
  });
}

function countRoster(roster) {
  return roster.reduce((counts, id) => {
    counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  }, {});
}

function stallLabel(stall) {
  if (stall === "heavy") return "重失速";
  if (stall === "light") return "軽失速";
  return "安定";
}

function bind(selector, eventName, handler) {
  const element = app.querySelector(selector);
  if (element) element.addEventListener(eventName, handler);
}

function bindAll(selector, eventName, handler) {
  app.querySelectorAll(selector).forEach((element) => {
    element.addEventListener(eventName, (event) => handler(element, event));
  });
}

init();

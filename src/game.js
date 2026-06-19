export const PHASES = {
  CARD: "card",
  MOVE: "move",
  ATTACK: "attack",
  END: "end",
  ENEMY: "enemy",
  GAME_OVER: "game-over"
};

const EVEN_ROW_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 0, r: -1 },
  { q: -1, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 }
];

const ODD_ROW_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: 0, r: 1 },
  { q: 1, r: 1 }
];

export function createBoard(width, height) {
  const cells = [];
  const centerQ = (width - 1) / 2;
  const centerR = (height - 1) / 2;
  const radiusQ = width / 2;
  const radiusR = height / 2;

  for (let r = 0; r < height; r += 1) {
    for (let q = 0; q < width; q += 1) {
      const ellipse =
        ((q - centerQ) * (q - centerQ)) / (radiusQ * radiusQ) +
        ((r - centerR) * (r - centerR)) / (radiusR * radiusR);
      if (ellipse <= 1) {
        cells.push({ q, r, cloud: ((q * 7 + r * 11) % 5) === 0 });
      }
    }
  }

  return cells;
}

export function createGame({ scenario, aircraft }) {
  const aircraftById = Object.fromEntries(aircraft.map((item) => [item.id, item]));
  const playerRoster = scenario.availablePlayerAircraft.map((id) => aircraftById[id]);
  const defaultPlayerIds = [
    "spitfire-mkia",
    "spitfire-mkia",
    "hurricane-mkia",
    "hurricane-mkia",
    "typhoon-mkia",
    "typhoon-mkia"
  ];

  return {
    scenario,
    aircraftById,
    playerRoster,
    selectedRoster: defaultPlayerIds.slice(0, scenario.forceSize),
    board: createBoard(scenario.map.width, scenario.map.height),
    units: [],
    selectedUnitId: null,
    selectedTargetId: null,
    phase: PHASES.CARD,
    turn: 1,
    log: ["シナリオを開始できます。高度と速度を保って攻撃機会を作りましょう。"],
    winner: null
  };
}

export function setRoster(game, aircraftId, delta) {
  const next = [...game.selectedRoster];
  if (delta > 0 && next.length < game.scenario.forceSize) {
    next.push(aircraftId);
  }
  if (delta < 0) {
    const index = next.lastIndexOf(aircraftId);
    if (index >= 0) next.splice(index, 1);
  }
  return { ...game, selectedRoster: next };
}

export function rosterCost(game) {
  return game.selectedRoster.reduce((sum, id) => sum + game.aircraftById[id].cost, 0);
}

export function canStart(game) {
  return (
    game.selectedRoster.length === game.scenario.forceSize &&
    rosterCost(game) <= game.scenario.costLimit
  );
}

export function startBattle(game) {
  if (!canStart(game)) return game;

  const playerCells = spreadDeploymentCells(
    game.board,
    "player",
    game.scenario.map.width,
    game.scenario.map.height,
    game.scenario.forceSize
  );
  const enemyCells = spreadDeploymentCells(
    game.board,
    "enemy",
    game.scenario.map.width,
    game.scenario.map.height,
    game.scenario.forceSize
  );

  const playerUnits = game.selectedRoster.map((id, index) =>
    createUnit({
      id: `p-${index + 1}`,
      side: "player",
      aircraft: game.aircraftById[id],
      cell: playerCells[index],
      facing: 1
    })
  );
  const enemyUnits = game.scenario.enemyAircraft.map((id, index) =>
    createUnit({
      id: `e-${index + 1}`,
      side: "enemy",
      aircraft: game.aircraftById[id],
      cell: enemyCells[index],
      facing: 5
    })
  );

  return {
    ...game,
    units: [...playerUnits, ...enemyUnits],
    selectedUnitId: "p-1",
    selectedTargetId: "e-1",
    phase: PHASES.CARD,
    log: [
      "出撃しました。カード使用、移動、攻撃、ターン終了の順で進みます。",
      "ALTとSPDの差を見ると、狙える攻撃カードが変わります。"
    ]
  };
}

function spreadDeploymentCells(board, side, width, height, count) {
  const edgeCells = board
    .filter((cell) => (side === "player" ? cell.r >= height - 5 : cell.r <= 4))
    .sort((a, b) =>
      (side === "player" ? b.r - a.r : a.r - b.r) ||
      Math.abs(a.q - width / 2) - Math.abs(b.q - width / 2) ||
      a.q - b.q
    );
  const chosen = [];
  const used = new Set();

  for (let index = 0; index < count; index += 1) {
    const targetIndex = Math.round(((index + 0.5) * (edgeCells.length - 1)) / count);
    const target = edgeCells[targetIndex] ?? edgeCells[index];
    const cell = edgeCells
      .filter((candidate) => !used.has(`${candidate.q},${candidate.r}`))
      .sort((a, b) => {
        const distanceA = Math.abs(a.r - target.r) * 4 + Math.abs(a.q - target.q);
        const distanceB = Math.abs(b.r - target.r) * 4 + Math.abs(b.q - target.q);
        return distanceA - distanceB;
      })[0];

    if (cell) {
      used.add(`${cell.q},${cell.r}`);
      chosen.push(cell);
    }
  }

  return chosen;
}

function createUnit({ id, side, aircraft, cell, facing }) {
  return {
    id,
    side,
    aircraftId: aircraft.id,
    name: aircraft.name,
    type: aircraft.type,
    hp: aircraft.stats.maxHP,
    maxHP: aircraft.stats.maxHP,
    spd: 5,
    alt: 4,
    maxSPD: aircraft.stats.maxSPD,
    atk: aircraft.stats.atk,
    agi: aircraft.stats.agi,
    q: cell.q,
    r: cell.r,
    facing,
    defense: 0,
    movedThisTurn: false,
    attackedThisTurn: false,
    adjustedEnergyThisTurn: false
  };
}

export function selectUnit(game, unitId) {
  const unit = findUnit(game, unitId);
  if (!unit || unit.side !== "player" || unit.hp <= 0) return game;
  return {
    ...game,
    selectedUnitId: unitId,
    selectedTargetId: nearestEnemy(game, unit)?.id ?? game.selectedTargetId
  };
}

export function selectTarget(game, targetId) {
  const target = findUnit(game, targetId);
  if (!target || target.side !== "enemy" || target.hp <= 0) return game;
  return { ...game, selectedTargetId: targetId };
}

export function useTactic(game, tacticId) {
  if (game.phase !== PHASES.CARD) return game;
  const unit = selectedUnit(game);
  if (!unit) return game;

  const units = game.units.map((item) => {
    if (item.id !== unit.id) return item;
    if (tacticId === "energy-check") {
      return item.alt < item.spd ? { ...item, alt: item.alt + 1 } : { ...item, spd: item.spd + 1 };
    }
    if (tacticId === "cloud-cover") {
      return { ...item, defense: item.defense + 1 };
    }
    return item;
  });

  return {
    ...game,
    units,
    log: [`${unit.name} が戦術カードを使用。`, ...game.log].slice(0, 8)
  };
}

export function useAction(game, actionId) {
  if (game.phase !== PHASES.CARD) return game;
  const unit = selectedUnit(game);
  if (!unit) return game;
  if (actionId === "barrel-roll" && stallState(unit) !== "none") {
    return addLog(game, `${unit.name} は失速気味のためバレルロールを使えません。`);
  }

  const units = game.units.map((item) => {
    if (item.id !== unit.id) return item;
    if (actionId === "scissors") return { ...item, defense: item.defense + 1, spd: Math.max(0, item.spd - 1) };
    if (actionId === "barrel-roll") return { ...item, defense: item.defense + 2 };
    if (actionId === "dive-away") return { ...item, alt: Math.max(0, item.alt - 1), spd: item.spd + 2 };
    if (actionId === "immelmann") {
      return {
        ...item,
        spd: Math.max(0, item.spd - 1),
        alt: item.alt + 1,
        facing: (item.facing + 3) % 6
      };
    }
    return item;
  });

  return {
    ...game,
    units,
    log: [`${unit.name} が行動カードを使用。`, ...game.log].slice(0, 8)
  };
}

export function nextPhase(game) {
  if (game.phase === PHASES.GAME_OVER) return game;
  if (game.phase === PHASES.CARD) return { ...game, phase: PHASES.MOVE };
  if (game.phase === PHASES.MOVE) return { ...game, phase: PHASES.ATTACK };
  if (game.phase === PHASES.ATTACK) return { ...game, phase: PHASES.END };
  if (game.phase === PHASES.END) return endPlayerTurn(game);
  if (game.phase === PHASES.ENEMY) return runComputerTurnSteps(game).at(-1)?.game ?? game;
  return game;
}

export function moveSelectedUnit(game, q, r) {
  if (game.phase !== PHASES.MOVE) return game;
  const unit = selectedUnit(game);
  const cell = game.board.find((item) => item.q === q && item.r === r);
  if (!unit || !cell || occupied(game, q, r)) return game;
  if (unit.movedThisTurn) {
    return addLog(game, `${unit.name} はこのターンすでに移動済みです。`);
  }
  const distance = hexDistance(unit, cell);
  const range = moveRange(unit);
  if (distance > range) {
    return addLog(game, `${unit.name} の移動距離は ${range} マスです。`);
  }

  const facing = directionBetween(unit, cell) ?? unit.facing;
  const units = game.units.map((item) =>
    item.id === unit.id ? { ...item, q, r, facing, movedThisTurn: true } : item
  );
  return {
    ...game,
    units,
    selectedTargetId: nearestEnemy({ ...game, units }, { ...unit, q, r })?.id ?? game.selectedTargetId,
    log: [`${unit.name} が ${distance} マス移動。`, ...game.log].slice(0, 8)
  };
}

export function attack(game, attackId) {
  if (game.phase !== PHASES.ATTACK) return game;
  const attacker = selectedUnit(game);
  const target = findUnit(game, game.selectedTargetId);
  if (!attacker || !target || target.hp <= 0) return game;
  if (attacker.attackedThisTurn) {
    return addLog(game, `${attacker.name} はこのターンすでに攻撃済みです。`);
  }

  return resolveAttack(game, attacker, target, attackId);

  const result = attackPreview(attacker, target, attackId);
  if (!result.usable) return addLog(game, result.reason);

  const reduced = Math.max(0, result.damage - target.defense);
  const units = game.units.map((unit) => {
    if (unit.id === attacker.id) return { ...unit, attackedThisTurn: true };
    if (unit.id !== target.id) return unit;
    return { ...unit, hp: Math.max(0, unit.hp - reduced), defense: 0 };
  });
  const next = checkVictory({
    ...game,
    units,
    log: [
      `${attacker.name} の ${result.name}。${target.name} に ${reduced} ダメージ。`,
      ...game.log
    ].slice(0, 8)
  });
  return next;
}

function resolveAttack(game, attacker, target, attackId, actorLabel = "") {
  const result = attackPreview(attacker, target, attackId);
  if (!result.usable) return addLog(game, result.reason);

  const targetDamage = Math.max(0, result.damage - target.defense);
  const selfDamage = Math.max(0, (result.selfDamage ?? 0) - attacker.defense);
  let units = game.units.map((unit) => {
    if (unit.id === attacker.id) return { ...unit, attackedThisTurn: true };
    if (unit.id !== target.id) return unit;
    return { ...unit, hp: Math.max(0, unit.hp - targetDamage), defense: 0 };
  });

  units = applyAttackAftermath(
    { ...game, units },
    units,
    attacker,
    target,
    attackId,
    selfDamage,
    result.selfDamage ?? 0
  );

  const selfDamageText = selfDamage > 0 ? ` / 反撃 ${selfDamage}` : "";
  return checkVictory({
    ...game,
    units,
    log: [
      `${actorLabel}${attacker.name} の ${result.name}。${target.name} に ${targetDamage} ダメージ${selfDamageText}。`,
      ...game.log
    ].slice(0, 8)
  });
}

function applyAttackAftermath(game, units, attacker, target, attackId, selfDamage, rawSelfDamage) {
  const passCell =
    attackId === "horizontal-boom-zoom" || attackId === "vertical-boom-zoom"
      ? passThroughCell(game, attacker, target)
      : null;

  return units.map((unit) => {
    if (unit.id !== attacker.id) return unit;

    let next = { ...unit };
    if (attackId === "vertical-boom-zoom") {
      const altDrop = Math.max(0, attacker.alt - target.alt);
      next = {
        ...next,
        alt: target.alt,
        spd: next.spd + altDrop * 2
      };
    }
    if ((attackId === "horizontal-boom-zoom" || attackId === "vertical-boom-zoom") && passCell) {
      next = {
        ...next,
        q: passCell.q,
        r: passCell.r,
        facing: directionBetween(target, passCell) ?? directionBetween(attacker, passCell) ?? next.facing
      };
    }
    if (attackId === "turn-fight") {
      next = { ...next, spd: Math.max(0, next.spd - 2) };
    }
    if (attackId === "vertical-turn") {
      next = {
        ...next,
        alt: Math.max(0, next.alt - 1),
        spd: Math.max(0, next.spd - 1)
      };
    }
    if (rawSelfDamage > 0) {
      next = { ...next, hp: Math.max(0, next.hp - selfDamage), defense: 0 };
    }
    return next;
  });
}

function passThroughCell(game, attacker, target) {
  const currentDistance = hexDistance(attacker, target);
  return game.board
    .filter((cell) => !occupied(game, cell.q, cell.r, attacker.id))
    .filter((cell) => hexDistance(cell, target) === 1)
    .filter((cell) => hexDistance(cell, attacker) > currentDistance)
    .sort((a, b) => passThroughScore(attacker, target, b) - passThroughScore(attacker, target, a))[0] ?? null;
}

function passThroughScore(attacker, target, cell) {
  return hexDistance(cell, attacker) * 10 + hexDistance(cell, target) + (cell.cloud ? 1 : 0);
}

export function adjustEnergy(game, mode) {
  if (game.phase !== PHASES.END) return game;
  const unit = selectedUnit(game);
  if (!unit) return game;
  if (unit.adjustedEnergyThisTurn) {
    return addLog(game, `${unit.name} はこのターンすでにALT/SPD調整済みです。`);
  }
  if (mode === "dive" && unit.alt <= 0) {
    return addLog(game, `${unit.name} はALTが足りないため急降下変換できません。`);
  }

  const units = game.units.map((item) => {
    if (item.id !== unit.id) return item;
    if (mode === "spd-up") return { ...item, spd: item.spd + 1, adjustedEnergyThisTurn: true };
    if (mode === "spd-down") return { ...item, spd: Math.max(0, item.spd - 1), adjustedEnergyThisTurn: true };
    if (mode === "alt-up") return { ...item, alt: item.alt + 1, adjustedEnergyThisTurn: true };
    if (mode === "alt-down") return { ...item, alt: Math.max(0, item.alt - 1), adjustedEnergyThisTurn: true };
    if (mode === "dive") {
      return {
        ...item,
        alt: item.alt - 1,
        spd: item.spd + 2,
        adjustedEnergyThisTurn: true
      };
    }
    return item;
  });

  return { ...game, units };
}

export function attackPreview(attacker, target, attackId) {
  const distance = hexDistance(attacker, target);
  const isAdjacent = distance === 1;
  const altDifference = attacker.alt - target.alt;
  const spdDifference = attacker.spd - target.spd;
  const closeAltitude = Math.abs(altDifference) <= 1;

  if (attackId === "vertical-boom-zoom") {
    if (!isAdjacent || altDifference <= 0) {
      return unusable("垂直一撃離脱には隣接とALT優位が必要です。");
    }
    return usable("垂直一撃離脱", attacker.atk + altDifference);
  }
  if (attackId === "horizontal-boom-zoom") {
    if (distance > 2 || !closeAltitude || spdDifference <= 0) {
      return unusable("水平一撃離脱には2マス以内、ALT差1以内、SPD優位が必要です。");
    }
    return usable("水平一撃離脱", attacker.atk + spdDifference);
  }
  if (attackId === "turn-fight") {
    if (!isAdjacent || !closeAltitude) {
      return unusable("横旋回戦には隣接とALT差1以内が必要です。");
    }
    return usable("横旋回戦", attacker.agi - target.agi);
  }
  if (attackId === "vertical-turn") {
    if (!isAdjacent || Math.abs(altDifference) > 2) {
      return unusable("縦旋回戦には隣接とALT差2以内が必要です。");
    }
    return usable("縦旋回戦", attacker.spd + attacker.alt - target.spd - target.alt);
  }
  if (attackId === "head-on") {
    if (!isAdjacent || !closeAltitude) {
      return unusable("ヘッドオンには隣接とALT差1以内が必要です。");
    }
    return usable(
      "ヘッドオン",
      attacker.atk - Math.floor(target.agi / 2),
      Math.floor(target.atk / 2)
    );
  }
  return unusable("攻撃カードが不明です。");

  const adjacent = hexDistance(attacker, target) === 1;
  const stalling = stallState(target);
  const spdDiff = Math.max(0, attacker.spd - target.spd);
  const altDiff = Math.max(0, attacker.alt - target.alt);

  if (attackId === "vertical-boom-zoom") {
    if (!adjacent || attacker.alt <= target.alt) {
      return unusable("垂直一撃離脱には隣接と高度優位が必要です。");
    }
    return usable("垂直一撃離脱", attacker.atk + altDiff + Math.ceil(spdDiff / 2) + (stalling !== "none" ? 2 : 0));
  }
  if (attackId === "horizontal-boom-zoom") {
    if (!adjacent || attacker.spd < target.spd) {
      return unusable("水平一撃離脱には隣接と速度優位が必要です。");
    }
    return usable("水平一撃離脱", attacker.atk + Math.ceil(spdDiff / 2));
  }
  if (attackId === "turn-fight") {
    if (!adjacent || stallState(attacker) === "heavy") {
      return unusable("横旋回戦には隣接が必要で、重失速中は使えません。");
    }
    return usable("横旋回戦", Math.max(1, 2 + attacker.agi - target.agi));
  }
  if (attackId === "vertical-turn") {
    if (!adjacent || attacker.spd < 4) {
      return unusable("縦旋回戦には隣接とSPD 4以上が必要です。");
    }
    return usable("縦旋回戦", Math.max(1, 1 + Math.ceil(attacker.spd / 3) + Math.ceil((attacker.agi - target.agi) / 2)));
  }
  if (attackId === "head-on") {
    if (!adjacent || !isHeadOn(attacker, target)) {
      return unusable("ヘッドオンには正面同士の隣接が必要です。");
    }
    return usable("ヘッドオン", Math.max(1, attacker.atk + 1 - Math.floor(target.agi / 4)));
  }
  return unusable("攻撃カードが不明です。");
}

function usable(name, damage, selfDamage = 0) {
  return {
    usable: true,
    name,
    damage: Math.max(0, Math.floor(damage)),
    selfDamage: Math.max(0, Math.floor(selfDamage))
  };
}

function unusable(reason) {
  return { usable: false, reason, damage: 0 };
}

function endPlayerTurn(game) {
  const units = game.units.map((unit) => {
    if (unit.side !== "player" || unit.hp <= 0) return unit;
    return resetTurnFlags(applyOverspeed({ ...unit, defense: 0 }));
  });
  return { ...game, units, phase: PHASES.ENEMY };
}

function runEnemyTurn(game) {
  let next = addLog(game, "Computerターン開始。接近しつつ高度を取り、一撃離脱を狙います。");
  const enemies = next.units.filter((unit) => unit.side === "enemy" && unit.hp > 0);

  for (const enemy of enemies) {
    let current = findUnit(next, enemy.id);
    let target = chooseComputerTarget(next, current);
    if (!current || !target) continue;

    next = applyComputerEnergyPlan(next, current, target);
    current = findUnit(next, enemy.id);
    target = chooseComputerTarget(next, current);
    if (!current || !target) continue;

    next = moveComputerUnit(next, current, target);
    const moved = findUnit(next, enemy.id);
    const movedTarget = chooseComputerTarget(next, moved);
    if (moved && movedTarget && hexDistance(moved, movedTarget) <= 2) {
      const attackId = chooseComputerAttack(moved, movedTarget);
      const result = attackPreview(moved, movedTarget, attackId);
      if (result.usable) {
        next = resolveAttack(next, moved, movedTarget, attackId, "敵 ");
        continue;

        const damage = Math.max(0, result.damage - movedTarget.defense);
        next = {
          ...next,
          units: next.units.map((unit) =>
            unit.id === moved.id
              ? { ...unit, attackedThisTurn: true }
              : unit.id === movedTarget.id
                ? { ...unit, hp: Math.max(0, unit.hp - damage), defense: 0 }
                : unit
          ),
          log: [`敵 ${moved.name} の ${result.name}。${movedTarget.name} に ${damage} ダメージ。`, ...next.log].slice(0, 8)
        };
        next = computerDisengage(next, moved.id, movedTarget, attackId);
      }
    }
  }

  const checked = checkVictory({
    ...next,
    units: next.units.map((unit) =>
      unit.side === "enemy" ? resetTurnFlags(applyOverspeed({ ...unit, defense: 0 })) : unit
    ),
    phase: PHASES.CARD,
    turn: next.turn + 1,
    selectedUnitId: firstAlive(next.units, "player")?.id ?? next.selectedUnitId,
    selectedTargetId: firstAlive(next.units, "enemy")?.id ?? next.selectedTargetId
  });

  return checked.winner
    ? checked
    : addLog(checked, `Computerターン完了。プレイヤーTurn ${checked.turn}、カード使用から開始します。`);
}

export function runComputerTurnSteps(game) {
  const steps = [];
  let next = addLog(game, "Computerターン開始。敵機は高度を取りながら接近します。");
  const addStep = (type, unitId = null) => {
    steps.push({ type, unitId, game: next });
  };
  addStep("start");

  const enemies = next.units.filter((unit) => unit.side === "enemy" && unit.hp > 0);
  for (const enemy of enemies) {
    let current = findUnit(next, enemy.id);
    let target = chooseComputerTarget(next, current);
    if (!current || !target) continue;

    const beforeEnergy = current;
    next = applyComputerEnergyPlan(next, current, target);
    current = findUnit(next, enemy.id);
    if (current && unitEnergyChanged(beforeEnergy, current)) addStep("energy", current.id);

    target = chooseComputerTarget(next, current);
    if (!current || !target) continue;

    const allowedSteps = moveRange(current);
    for (let step = 0; step < allowedSteps; step += 1) {
      if (chooseComputerAttack(current, target)) break;
      const moved = moveComputerUnitOneStep(next, current, target);
      if (moved === next) break;
      next = moved;
      addStep("move", current.id);
      current = findUnit(next, enemy.id);
      target = chooseComputerTarget(next, current);
      if (!current || !target) break;
    }

    const moved = findUnit(next, enemy.id);
    const movedTarget = chooseComputerTarget(next, moved);
    if (moved && movedTarget && hexDistance(moved, movedTarget) <= 2) {
      const attackId = chooseComputerAttack(moved, movedTarget);
      const result = attackPreview(moved, movedTarget, attackId);
      if (result.usable) {
        next = resolveAttack(next, moved, movedTarget, attackId, "敵 ");
        addStep("attack", moved.id);
      }
    }
  }

  const checked = checkVictory({
    ...next,
    units: next.units.map((unit) =>
      unit.side === "enemy" ? resetTurnFlags(applyOverspeed({ ...unit, defense: 0 })) : unit
    ),
    phase: PHASES.CARD,
    turn: next.turn + 1,
    selectedUnitId: firstAlive(next.units, "player")?.id ?? next.selectedUnitId,
    selectedTargetId: firstAlive(next.units, "enemy")?.id ?? next.selectedTargetId
  });

  next = checked.winner
    ? checked
    : addLog(checked, `Computerターン完了。プレイヤーTurn ${checked.turn}、カード使用から開始します。`);
  addStep("end");
  return steps;
}

function unitEnergyChanged(before, after) {
  return before.alt !== after.alt || before.spd !== after.spd || before.hp !== after.hp;
}

function chooseComputerTarget(game, enemy) {
  if (!enemy) return null;
  return game.units
    .filter((candidate) => candidate.side === "player" && candidate.hp > 0)
    .sort((a, b) => computerTargetScore(enemy, a) - computerTargetScore(enemy, b))[0];
}

function computerTargetScore(enemy, target) {
  const stallBonus = stallState(target) === "heavy" ? -6 : stallState(target) === "light" ? -3 : 0;
  const altitudeBonus = enemy.alt > target.alt ? -3 : 0;
  return hexDistance(enemy, target) * 5 + target.hp + stallBonus + altitudeBonus;
}

function applyComputerEnergyPlan(game, enemy, target) {
  const plan = computerEnergyPlan(enemy, target);
  if (!plan) return game;

  return {
    ...game,
    units: game.units.map((unit) =>
      unit.id === enemy.id ? { ...unit, ...plan.patch, adjustedEnergyThisTurn: true } : unit
    ),
    log: [`Computer ${enemy.name}: ${plan.message}`, ...game.log].slice(0, 8)
  };
}

function computerEnergyPlan(enemy, target) {
  const distance = hexDistance(enemy, target);

  if (stallState(enemy) === "heavy" && enemy.alt > 0) {
    return {
      patch: { alt: enemy.alt - 1, spd: enemy.spd + 2 },
      message: "急降下して速度を回復。"
    };
  }

  if (enemy.alt <= target.alt + 1 && enemy.spd > enemy.alt + 1) {
    return {
      patch: { alt: enemy.alt + 1 },
      message: "上昇して高度優位を作る。"
    };
  }

  if (enemy.alt <= target.alt + 1 && enemy.spd < enemy.maxSPD + 2) {
    return {
      patch: { spd: enemy.spd + 1 },
      message: "上昇前に速度を作る。"
    };
  }

  if (distance > 2 && enemy.spd < enemy.maxSPD + 2) {
    return {
      patch: { spd: enemy.spd + 1 },
      message: "接近のため速度を上げる。"
    };
  }

  if (distance <= 2 && enemy.alt > target.alt && enemy.spd < enemy.maxSPD + 2) {
    return {
      patch: { spd: enemy.spd + 1 },
      message: "一撃離脱に備えて速度を乗せる。"
    };
  }

  return null;
}

function moveComputerUnitOneStep(game, enemy, target) {
  if (chooseComputerAttack(enemy, target)) return game;

  const options = game.board
    .filter((cell) => !occupied(game, cell.q, cell.r, enemy.id))
    .filter((cell) => hexDistance(enemy, cell) === 1)
    .sort((a, b) => computerMoveScore(enemy, target, b) - computerMoveScore(enemy, target, a));
  const chosen = options[0];
  if (!chosen) return game;

  const facing = directionBetween(enemy, chosen) ?? enemy.facing;
  return {
    ...game,
    units: game.units.map((unit) =>
      unit.id === enemy.id ? { ...unit, q: chosen.q, r: chosen.r, facing, movedThisTurn: true } : unit
    )
  };
}

function moveComputerUnit(game, enemy, target) {
  if (chooseComputerAttack(enemy, target)) return game;

  const range = moveRange(enemy);
  const options = game.board
    .filter((cell) => !occupied(game, cell.q, cell.r, enemy.id))
    .filter((cell) => hexDistance(enemy, cell) <= range)
    .sort((a, b) => computerMoveScore(enemy, target, b) - computerMoveScore(enemy, target, a));
  const chosen = options[0];
  if (!chosen) return game;
  const facing = directionBetween(enemy, chosen) ?? enemy.facing;
  return {
    ...game,
    units: game.units.map((unit) =>
      unit.id === enemy.id ? { ...unit, q: chosen.q, r: chosen.r, facing, movedThisTurn: true } : unit
    )
  };
}

function computerMoveScore(enemy, target, cell) {
  const distance = hexDistance(cell, target);
  let score = -distance * 8;

  if (distance === 1 && enemy.alt > target.alt) score += 42;
  if (distance <= 2 && Math.abs(enemy.alt - target.alt) <= 1 && enemy.spd > target.spd) score += 32;
  if (distance === 1 && enemy.spd >= target.spd) score += 16;
  if (distance === 1 && enemy.alt <= target.alt && enemy.spd < target.spd) score -= 12;
  if (cell.cloud) score += 2;

  return score;
}

function chooseComputerAttack(attacker, target) {
  const options = [
    { id: "vertical-boom-zoom", bias: 100 },
    { id: "horizontal-boom-zoom", bias: 80 },
    { id: "vertical-turn", bias: 18 },
    { id: "turn-fight", bias: 8 },
    { id: "head-on", bias: 4 }
  ];
  const usableOptions = options
    .map((option) => ({ ...option, preview: attackPreview(attacker, target, option.id) }))
    .filter((item) => item.preview.usable)
    .sort((a, b) => b.preview.damage + b.bias - (a.preview.damage + a.bias));
  return usableOptions[0]?.id ?? null;
}

function computerDisengage(game, attackerId, target, attackId) {
  if (!["vertical-boom-zoom", "horizontal-boom-zoom"].includes(attackId)) return game;

  const attacker = findUnit(game, attackerId);
  if (!attacker) return game;

  const currentDistance = hexDistance(attacker, target);
  const options = game.board
    .filter((cell) => !occupied(game, cell.q, cell.r, attacker.id))
    .filter((cell) => hexDistance(attacker, cell) <= 1)
    .filter((cell) => hexDistance(cell, target) > currentDistance)
    .sort((a, b) => computerDisengageScore(attacker, target, b) - computerDisengageScore(attacker, target, a));
  const chosen = options[0];

  if (!chosen) {
    return {
      ...game,
      units: game.units.map((unit) =>
        unit.id === attacker.id ? { ...unit, spd: unit.spd + 1 } : unit
      )
    };
  }

  const facing = directionBetween(attacker, chosen) ?? attacker.facing;
  return {
    ...game,
    units: game.units.map((unit) =>
      unit.id === attacker.id
        ? { ...unit, q: chosen.q, r: chosen.r, facing, spd: unit.spd + 1 }
        : unit
    ),
    log: [`Computer ${attacker.name}: 一撃離脱で距離を取る。`, ...game.log].slice(0, 8)
  };
}

function computerDisengageScore(attacker, target, cell) {
  return hexDistance(cell, target) * 10 + cell.q + (cell.cloud ? 2 : 0);
}

function applyOverspeed(unit) {
  if (unit.spd > unit.maxSPD) {
    return { ...unit, spd: Math.max(unit.maxSPD, unit.spd - 2) };
  }
  return unit;
}

function resetTurnFlags(unit) {
  return {
    ...unit,
    movedThisTurn: false,
    attackedThisTurn: false,
    adjustedEnergyThisTurn: false
  };
}

function checkVictory(game) {
  const playerAlive = game.units.some((unit) => unit.side === "player" && unit.hp > 0);
  const enemyAlive = game.units.some((unit) => unit.side === "enemy" && unit.hp > 0);
  if (!enemyAlive) {
    return { ...game, winner: "player", phase: PHASES.GAME_OVER, log: ["勝利。敵航空隊を全滅させました。", ...game.log].slice(0, 8) };
  }
  if (!playerAlive) {
    return { ...game, winner: "enemy", phase: PHASES.GAME_OVER, log: ["敗北。航空隊が全滅しました。", ...game.log].slice(0, 8) };
  }
  return game;
}

export function selectedUnit(game) {
  return findUnit(game, game.selectedUnitId);
}

export function selectedTarget(game) {
  return findUnit(game, game.selectedTargetId);
}

export function findUnit(game, unitId) {
  return game.units.find((unit) => unit.id === unitId);
}

export function liveUnits(game, side) {
  return game.units.filter((unit) => unit.side === side && unit.hp > 0);
}

export function moveRange(unit) {
  return Math.max(1, Math.round(unit.spd / 4));
}

export function stallState(unit) {
  if (unit.spd <= unit.alt - 3) return "heavy";
  if (unit.spd <= unit.alt) return "light";
  return "none";
}

export function hexDistance(a, b) {
  const ac = offsetToCube(a);
  const bc = offsetToCube(b);
  return (
    Math.abs(ac.x - bc.x) +
    Math.abs(ac.y - bc.y) +
    Math.abs(ac.z - bc.z)
  ) / 2;
}

function offsetToCube(cell) {
  const x = cell.q - (cell.r - (cell.r & 1)) / 2;
  const z = cell.r;
  const y = -x - z;
  return { x, y, z };
}

export function reachableCells(game, unit) {
  if (!unit) return [];
  if (unit.movedThisTurn) return [];
  return game.board.filter(
    (cell) => hexDistance(unit, cell) <= moveRange(unit) && !occupied(game, cell.q, cell.r, unit.id)
  );
}

function occupied(game, q, r, exceptId = null) {
  return game.units.some((unit) => unit.id !== exceptId && unit.hp > 0 && unit.q === q && unit.r === r);
}

function nearestEnemy(game, unit) {
  return nearestOpponent(game, unit, "enemy");
}

function nearestOpponent(game, unit, side = unit.side === "player" ? "enemy" : "player") {
  return game.units
    .filter((candidate) => candidate.side === side && candidate.hp > 0)
    .sort((a, b) => hexDistance(unit, a) - hexDistance(unit, b))[0];
}

function firstAlive(units, side) {
  return units.find((unit) => unit.side === side && unit.hp > 0);
}

function directionBetween(from, to) {
  const dq = to.q - from.q;
  const dr = to.r - from.r;
  const directions = from.r & 1 ? ODD_ROW_DIRECTIONS : EVEN_ROW_DIRECTIONS;
  const index = directions.findIndex((dir) => dir.q === dq && dir.r === dr);
  return index >= 0 ? index : null;
}

function isHeadOn(attacker, target) {
  return (attacker.facing + 3) % 6 === target.facing;
}

function addLog(game, message) {
  return { ...game, log: [message, ...game.log].slice(0, 8) };
}

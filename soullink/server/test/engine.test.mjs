import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adjacent, applyMove, commitTurn, createMatch, findGroups, moved, timeoutTurn, useSkill } from "../src/engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data/game.json"), "utf8"));
const players = [
  { characterId: "ignis", skinId: "base", catalogRevision: 1 },
  { characterId: "selene", skinId: "base", catalogRevision: 1 }
];

test("board groups and adjacency match the Godot contract", () => {
  const dimensions = { cols: 3, rows: 3 };
  const board = [0, 1, 0, 1, 0, 2, 2, 0, 2];
  assert.equal(adjacent(0, 1, dimensions), true);
  assert.equal(adjacent(2, 3, dimensions), false);
  assert.deepEqual(findGroups(moved(board, 1, 4), dimensions), [{ color: 0, cells: [0, 1, 2], wave: 0 }]);
});

test("same seed creates deterministic playable state", () => {
  const first = createMatch(1001, players, catalog, { cols: 6, rows: 5 }, 10);
  const second = createMatch(1001, players, catalog, { cols: 6, rows: 5 }, 10);
  assert.deepEqual(first, second);
  assert.equal(first.boards.length, 2);
  assert.equal(findGroups(first.boards[0], first.dimensions).length, 0);
});

test("server rejects another player acting out of turn", () => {
  const match = createMatch(1000, players, catalog, { cols: 6, rows: 5 }, 10);
  assert.equal(match.actor, 0);
  assert.throws(() => applyMove(match, 1, []), /not_your_turn/);
});

test("timeout assistance advances a legal authoritative turn", () => {
  const match = createMatch(1000, players, catalog, { cols: 6, rows: 5 }, 10);
  const result = timeoutTurn(match, 20);
  assert.equal(result.match.actor, 1);
  assert.equal(result.match.stage, "puzzle");
  assert.equal(result.receipt.pending.timedOut, true);
  assert.ok(result.receipt.strike.damage > 0);
});

test("MP skills are repeatable while the authoritative balance remains", () => {
  let match = createMatch(1000, players, catalog, { cols: 6, rows: 5 }, 10);
  match.stage = "action";
  match.pending = { groups: [], effects: [], manualCombo: 0, manaGain: 0, manaDenied: 0, healing: 0, green: 0, boost: 0, hpLoss: 0 };
  match.fighters[0].mana = 80;
  let used = useSkill(match, 0);
  assert.equal(used.match.fighters[0].mana, 40);
  used = useSkill(used.match, 0);
  assert.equal(used.match.fighters[0].mana, 0);
  assert.equal(used.match.fighters[0].activeUses, 2);
  assert.throws(() => useSkill(used.match, 0), /mana_insufficient/);
  const committed = commitTurn(used.match, 0, 30);
  assert.equal(committed.match.actor, 1);
});

test("queued green and boost bonuses wait for the owner's next turn", () => {
  let match = createMatch(1000, players, catalog, { cols: 6, rows: 5 }, 10);
  match.fighters[0].nextGreen = 0.2;
  match.fighters[0].nextBoost = 0.25;
  match.stage = "action";
  match.pending = { groups: [], effects: [], manualCombo: 0, manaGain: 0, manaDenied: 0, healing: 0, green: 0, boost: 0, hpLoss: 0 };
  match = commitTurn(match, 0, 20).match;
  assert.equal(match.actor, 1);
  assert.equal(match.fighters[0].nextGreen, 0.2);
  assert.equal(match.fighters[0].nextBoost, 0.25);
  match.stage = "action";
  match.pending = { groups: [], effects: [], manualCombo: 0, manaGain: 0, manaDenied: 0, healing: 0, green: 0, boost: 0, hpLoss: 0 };
  match = commitTurn(match, 1, 30).match;
  assert.equal(match.actor, 0);
  assert.equal(match.turnGreen, 0.2);
  assert.equal(match.turnBoost, 0.25);
  assert.equal(match.fighters[0].nextGreen, 0);
  assert.equal(match.fighters[0].nextBoost, 0);
});

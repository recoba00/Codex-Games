'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20261021010000_initial_online_test.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const exportPreset = fs.readFileSync(path.join(__dirname, '..', 'export_presets.cfg'), 'utf8');
const webShell = fs.readFileSync(path.join(__dirname, '..', 'web', 'shell.html'), 'utf8');

test('mobile virtual keyboard is enabled for Godot web exports', () => {
  assert.match(exportPreset, /^html\/experimental_virtual_keyboard=true$/m);
});

test('handoff and operational sources stay outside the game export', () => {
  for (const entry of ['ABOUT.md', 'TASKS.md', 'README.md', 'server/*', 'supabase/*', 'tools/*']) {
    assert.match(exportPreset, new RegExp(`exclude_filter=.*${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  }
});

test('mobile text entry does not trigger persistent browser zoom', () => {
  assert.match(webShell, /maximum-scale=1, user-scalable=no/);
  assert.match(webShell, /#viewport > input, #viewport > textarea \{ font-size: 16px !important; \}/);
});

test('initial online schema includes the required persistent records', () => {
  for (const table of ['profiles', 'game_catalog', 'user_skins', 'match_results']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\b`, 'i'));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
});

test('clients cannot write server-owned catalog, skins, or match results', () => {
  for (const table of ['game_catalog', 'user_skins', 'match_results']) {
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, 'i'));
    assert.doesNotMatch(
      sql,
      new RegExp(`grant[^;]*(insert|update|delete)[^;]*public\\.${table}[^;]*to (anon|authenticated)`, 'i')
    );
  }
  assert.match(sql, /grant all on table public\.match_results to service_role/i);
});

test('authenticated players only read their own private records', () => {
  assert.match(sql, /profiles_select_own[\s\S]*auth\.uid\(\)[\s\S]*= id/i);
  assert.match(sql, /user_skins_select_own[\s\S]*auth\.uid\(\)[\s\S]*= user_id/i);
  assert.match(
    sql,
    /match_results_select_participant[\s\S]*auth\.uid\(\)[\s\S]*player_one_id, player_two_id/i
  );
});

test('artwork bucket is public-read but has no client write policy', () => {
  assert.match(sql, /'soullink-content'[\s\S]*true,[\s\S]*8388608/i);
  assert.match(sql, /soullink_content_public_read[\s\S]*for select[\s\S]*bucket_id = 'soullink-content'/i);
  assert.doesNotMatch(sql, /on storage\.objects for (insert|update|delete)/i);
});

test('migration contains no committed credentials', () => {
  assert.doesNotMatch(sql, /supabase_service_role_key|sb_secret_|postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(sql, /qcfqflqbbuluorjedadw/i);
});

#!/usr/bin/env node
// Portão de lint por BASELINE: o repo tem problemas de eslint pré-existentes, então
// `npm run lint` não pode ser bloqueante. Este script falha só se o número de ERROS ou
// de AVISOS passar do registrado em scripts/lint-baseline.json.
//
//   npm run lint:baseline                 confere contra o baseline (é o que o CI roda)
//   npm run lint:baseline -- --atualizar  regrava o baseline com a medição atual
//
// ⚠️ O portão é por TOTAL: corrigir um problema e criar outro passa. A contagem por regra
// sai no relatório só para dizer ONDE subiu. Quando o total CAIR, regrave o baseline no
// mesmo commit — senão a folga vira espaço para problema novo entrar calado.
import { ESLint } from "eslint";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ARQUIVO = fileURLToPath(new URL("./lint-baseline.json", import.meta.url));
const atualizar = process.argv.includes("--atualizar");

const eslint = new ESLint();
const resultados = await eslint.lintFiles(["."]);

let erros = 0;
let avisos = 0;
const porRegra = {};
for (const r of resultados) {
  erros += r.errorCount;
  avisos += r.warningCount;
  for (const m of r.messages) {
    const regra = m.ruleId ?? "(sem regra)";
    porRegra[regra] = (porRegra[regra] ?? 0) + 1;
  }
}
const regrasOrdenadas = Object.fromEntries(Object.entries(porRegra).sort(([a], [b]) => a.localeCompare(b)));

if (atualizar) {
  const hoje = new Date().toISOString().slice(0, 10);
  writeFileSync(ARQUIVO, JSON.stringify({ medido_em: hoje, erros, avisos, por_regra: regrasOrdenadas }, null, 2) + "\n");
  console.log(`Baseline regravado: ${erros} erros, ${avisos} avisos (${erros + avisos} problemas).`);
  process.exit(0);
}

const base = JSON.parse(readFileSync(ARQUIVO, "utf8"));
console.log(`Lint: ${erros} erros, ${avisos} avisos — baseline: ${base.erros} erros, ${base.avisos} avisos (medido em ${base.medido_em}).`);

const subiu = erros > base.erros || avisos > base.avisos;
if (subiu) {
  console.error("\n🔴 O lint PASSOU do baseline. Regras que subiram:");
  const todas = new Set([...Object.keys(porRegra), ...Object.keys(base.por_regra ?? {})]);
  for (const regra of [...todas].sort()) {
    const agora = porRegra[regra] ?? 0;
    const antes = base.por_regra?.[regra] ?? 0;
    if (agora > antes) console.error(`  ${regra}: ${antes} → ${agora}`);
  }
  console.error("\nRode `npm run lint` para ver arquivo e linha.");
  process.exit(1);
}

if (erros < base.erros || avisos < base.avisos) {
  console.log("\n🟢 O lint BAIXOU. Regrave o baseline no mesmo commit: npm run lint:baseline -- --atualizar");
}

# Journal de boucle TDD — Etude-Groupbot

Méthode: boucle-tdd-cicd (red→green→refactor). Chaque tâche = 1 commit, vérif = `node --test tests/group-agents.test.mjs`.

## Conventions
- VERIFY = `node --test tests/group-agents.test.mjs`
- REGRESSION = `node --test tests/profile-pane.test.mjs tests/routine-prompt.test.mjs`
- COMMIT = `node --check plugin.js && VERIFY && REGRESSION` verts avant commit.

## Tâches (jalons)
| # | Tâche | CA | État | Itérations | Tours-sans-progrès | Régressions |
|---|-------|----|------|-----------|--------------------|-------------|
| 0 | Scaffold teams.js + harnais | — | ✅ DONE (commit 16ac8b6) + REVIEW-APPROVED (0 🔴) | 1 | 0 | 0 |
| 1 | normalizeTeams | CA1,CA2,CA2b,CA2c,CA2d,CA2e | ✅ DONE (commit abd0638) + REVIEW-APPROVED (0 🔴, mutation 6/6) | 1 | 0 | 0 |
| 2 | teamTargets | CA3 | ✅ DONE (commit d0a2b26) + REVIEW-APPROVED (0 🔴) | 1 | 0 | 0 |
| 3 | projectTeamContext | CA4,CA4b,CA4c,CA10b | ✅ DONE (commit 67cd4f3) + REVIEW-APPROVED (0 🔴) | 1 | 0 | 0 |
| 4 | teamPrompt | CA5 | ✅ DONE (commit 834cbdf) + REVIEW-APPROVED (0 🔴) | 1 | 0 | 0 |
| 5 | storage save/load | CA7,CA7b,CA8,CA7c,CA7d,CA7e | ✅ DONE (commit 495746a) + REVIEW-APPROVED (0 🔴) | 1 | 0 | 0 |
| 6 | runTeamFanout | CA6,CA6b,CA6c | ✅ DONE (commit 238a8e6) + REVIEW-APPROVED (0 🔴) + D16/D17 hardening (c57eb3f) | 1 | 0 | 0 |
| 7 | generate-guard | CA9 | ✅ DONE (commit c57eb3f + CA9 test 65/65) | 1 | 0 | 0 |
| 8 | UI wiring + CA11 | CA11 | ✅ DONE (commit 074a2a2) + FIX inline (e4f50d7) — deployed, no load error | 1 | 0 | 0 |
| 9 | Global CI check | CA12,CA13 | ✅ DONE (node --check + node --test green, CA12/CA13 tests) | 1 | 0 | 0 |

## Décisions de revue (revue-qualite-dette)
- 🔴 Bloquant / 🟡 À traiter / ⚪ Nit — à remplir pendant la Phase 4.

## Freins d'urgence (si déclenchés → escalade)
- Itérations max (8) atteintes · stagnation (3 tours) · régression · action sensible/irréversible.

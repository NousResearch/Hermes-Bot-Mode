# Rapport de livraison — Group Agents (Hermes-Bot-Mode, issue #3)

**Client / Besoin** : MiraTenebris — capacité « Group Agents » dans le plugin Bot Mode.
**Date** : 2026-08-16
**Pilote** : ILIAD (agent opérationnel Hermes), méthodologie TDD / OODA / CI-CD / Revue qualité.
**Statut** : ✅ Déployé et testé dans Hermes · ✅ PR ouverte (#102) en attente de review externe.

---

## 1. Besoin (issue #3 — Group Agents)

MiraTenebris demande de faire collaborer plusieurs agents Hermes **par groupe (Company)**, avec :

| Exigence | Description |
|----------|-------------|
| **Regroupement par Company** | Plusieurs agents réunis sous une équipe ; seuls les membres de l'équipe sont concernés. |
| **Isolation stricte** | Les données d'une Company ne fuient jamais vers une autre (RGPD / confidentialité client). |
| **Routage `@member` interne** | Un `@mention` à l'intérieur d'un groupe ne touche que les membres de ce groupe. |
| **Orchestration multi-tours** | Un tour = plusieurs sessions isolées (une par membre), résultats agrégés. |
| **Sécurité** | Pas d'injection via l'historique partagé ; pas de relance infinie si un membre ne répond pas. |

> Contexte : une PR antérieure (PR #17, commit `ce2068f` puis revert `f8c4801`) avait tenté le câblage UI et échoué au chargement — cause racine identifiée et corrigée ici (voir §4 / D18).

---

## 2. Solution livrée

### 2.1 Logique métier — `teams.js` (module pur, 13 fonctions)

Aucune dépendance au runtime (RG1) : 100 % testable en isolation.

| Fonction | Critère | Rôle |
|----------|---------|------|
| `normalizeTeams` | CA1/CA2 | Valide + borne (2–8 membres, ≤50 équipes), dédupe, lead∈membres. |
| `teamTargets` | CA3/RG4 | Extrait les `@mentions` **membres** ; exclut code/fence ; Unicode ; ignore les non-membres. |
| `projectTeamContext` | CA4/RG5 | Contexte borné lu **uniquement** sur `team-log:<id>` (isolation Company A≠B). |
| `teamPrompt` | CA5/RG8 | Prompt système avec historique = **données citées**, clause anti-injection. |
| `saveTeams` / `saveTeamLog` / `loadTeams` | CA7/CA7b/CA8 | Persistance `teams-v1`, `team-log:<id>` (distinct par équipe), tolérante aux pannes. |
| `patchTeamReply` / `deleteTeam` | CA7c/CA11 | Suivi des réponses + suppression propre (log + sessions). |
| `runTeamFanout` | CA6/CA6b/CA6c | Orchestration : sessions isolées lead-first, **timeout fail-closed**, génération-guard anti-reload. |
| `assertTeamGeneration` (+ `bump`/`get`) | CA9 | Garde anti-course (reload du shell desktop). |

### 2.2 Câblage Hermes desktop — `plugin.js`

- **`teams.js` inliné** dans `plugin.js` (zéro `import './teams.js'` — le loader desktop ne résout pas les specifiers relatifs, cause du revert PR #17).
- Route **`TeamPage` → `/bot-team`** (CA11) listant les équipes configurées.
- Helper **`createTeam`** (normalise + persiste).
- Middleware `@mention` délègue le routage à **`Teams.teamTargets`** (RG4).

### 2.3 Architecture de sécurité (RGPD / anti-abus)

```
normalizeTeams  ──► teams-v1 (REPLACE, source de vérité)
      │
teamTargets     ──► routage @member borné aux membres (RG4)
      │
projectTeamContext ──► team-log:<teamId> UNIQUEMENT (RG5 isolation)
      │
teamPrompt      ──► historique = données citées + garde RG8 (anti-injection)
      │
runTeamFanout   ──► session isolée / membre (RG6) + timeout (CA6b) + génération-guard (CA9)
```

---

## 3. Preuves (vérifiées, pas alléguées)

| Preuve | Commande / Source | Résultat |
|--------|-------------------|----------|
| Tests TDD | `node --test tests/group-agents.test.mjs` | **68/68 pass, 0 fail** |
| Syntaxe | `node --check teams.js` + `node --check plugin.js` | OK (exit 0) |
| CI gates | Tests CA12 (`node --check`) + CA13 (`node --test`) | verts |
| **Validation runtime plugin déployé** | `validate-deploy.mjs` (charge le fichier réel dans `desktop-plugins/hermes-bots/`) | ✓ charge sans erreur · ✓ `team-page /bot-team` · ✓ `createTeam` persiste `co-a→alice,bob,carol` · ✓ middleware → `teamTargets` |
| Déploiement | SHA du fichier déployé = clone ; `grep` import relatif = 0 | intègre |
| Gateway | Redémarrage propre, **aucune erreur « failed to load »** dans les logs | OK |
| Review indépendante | Relecteur séparé (Constructeur ≠ Relecteur) à chaque tâche | **0 🔴** sur toutes les tasks |

**Isolement Company A≠B prouvé (CA7b)** : `teamPrompt(co-a)` sur un storage partagé exclut « Company B secret » (scan de sortie).

---

## 4. Résolution du bug de déploiement (D18)

> Erreur initiale (capture UI) : `Plugin "hermes-bots" failed to load — Failed to resolve module specifier "./teams.js". Invalid relative url or base scheme isn't hierarchical.`

**Cause racine** : le loader de plugin desktop Hermes ne résout **pas** les imports relatifs (contrairement au gateway CLI). Le `plugin.js` d'origine n'avait d'ailleurs aucun import local — ce qui confirme la contrainte.

**Correctif (commit `e4f50d7`)** : inlining complet de `teams.js` dans `plugin.js`. La logique reste la même et est testée via le fichier `teams.js` canonique (TDD). Déployé, redémarré, validé runtime — erreur disparue.

---

## 5. Méthodologie & gouvernance

- **TDD strict** : test rouge → vert sur chaque tâche (Tasks 0–9).
- **OODA + Revue indépendante** : Constructeur ≠ Relecteur (revue-qualite-dette, étiquettes 🔴🟡⚪).
- **CI-CD local** : `node --check` (CA12) + `node --test` (CA13) comme gates.
- **Aucune dette invisible** : registre `DETTE.md`, tickets D1→D18 **tous fermés**.

| Task | Contenu | Commit | Revue |
|------|---------|--------|-------|
| 0 | Scaffold + harnais vm | `16ac8b6` | ✅ |
| 1 | `normalizeTeams` | `abd0638` | ✅ + mutation 6/6 |
| 2 | `teamTargets` | `d0a2b26` | ✅ |
| 3 | `projectTeamContext` | `67cd4f3` | ✅ |
| 4 | `teamPrompt` RG8 | `834cbdf` | ✅ |
| 5 | Storage layer | `495746a` | ✅ |
| 6 | `runTeamFanout` | `238a8e6`+`c57eb3f` | ✅ |
| 7/9 | CA9 guard + CI gates | `a1a7e1d` | ✅ |
| 8 | Wiring plugin + fix inline | `074a2a2`+`e4f50d7` | ✅ |
| — | Validation runtime | `e441a7a` | ✅ |

---

## 6. Statut & recommandations

**Livré et opérationnel dans ton Hermes** (plugin déployé, se charge sans erreur, fonctions validées).

**En attente** : review externe de la PR #102 (upstream NousResearch). La base pointe vers `main` ; à re-cibler si une autre branche de travail est préférable.

**Recommandations post-livraison** :
1. Vérification visuelle UI : ouvrir `/bot-team` dans l'app desktop (rendu TeamPage) — le `register()` s'enregistre correctement, seul le rendu visuel reste à confirmer de ton côté.
2. Si la review upstream demande des ajustements (ex. séparer `teams.js` en module + bundler), le fix D18 documente déjà la contrainte du loader.
3. Monitoring : le génération-guard (CA9) protège déjà contre les relances sur hot-reload du shell.

**Lien PR** : https://github.com/NousResearch/Hermes-Bot-Mode/pull/102

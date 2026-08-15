# Registre de dette technique — Etude-Groupbot

Règle: aucune dette invisible. Toute dette = ticket (id, où, quoi, pourquoi, intérêt, échéance, statut).

| ID | Où | Quoi | Pourquoi contractée | Intérêt (coût récurrent) | Échéance / déclencheur | Statut |
|----|----|------|---------------------|--------------------------|------------------------|--------|
| D0 | plugin.js + tests/profile-pane.test.mjs (amont) | 4 tests `profile-pane` rouges: le test attend `queryKey: [ID, 'profile-summary', name]` mais plugin.js n'a 0 occurrence de `profile-summary`. Régression PRÉEXISTANTE du repo upstream (avant Task 0). | Bloque la validation CA11 locale sur le même harnais, et fausse le signal de régression. | À isolement: soit corriger le test amont, soit exclure profile-pane du gate de régression de l'étude. | ouvert |
| D4 | teams.js teamTargets (revue Task 2) | 🟡 `(^|\s)` ancre ignore `@bob` encadré par ponctuation non-blanche `(@bob)`, `[@bob]`, `"@bob`, `@bob@alice`. Fail-closed (RG4 safe) mais faux-négatif fréquent. | Routage manqué en usage réel. | Remplacé par look-behind `(?<!@)@([\p{L}\p{N}_-]+)` (Task 3, `u` flag). Note: `(?<![\w@])` réduit à `(?<!@)` car le cas d'acceptation requis `@bob@alice` exige le routage du 2e handle (incompatible avec l'exclusion des `@` préfixés par un caractère-mot). | fermé (Task 3) |
| D5 | teams.js teamTargets (revue Task 2) | 🟡 Unicode tronqué: `@Bôb` → unknown:['B']. Classe `[a-z0-9_-]` coupe au 1er non-ASCII. | Handle non-ASCII mal routé. | Décider: rejeter entier OU `\p{L}\p{N}`. Adopter `\p{L}\p{N}_-` (Task 3, fait: `@Bôb` → target 'Bôb', non unknown ['B']). | fermé (Task 3) |
| D6 | tests/group-agents.test.mjs (revue Task 2) | 🟡 Trous CA3: (a) membre réel DANS code-span (exclusion clé), (b) fenced block, (c) dedupe/ordre, (d) text null/undefined + members vide. | Régression silencieuse possible Task 3+. | Ajouter 4 tests (Task 3, faits: D6a code-span membre réel, D6b fenced, D6c dedupe/ordre, D6d null/[]). | fermé (Task 3) |
| D7 | teams.js teamTargets (revue Task 2) | 🟡 Fence non fermée laisse `@bob` routé (fail-open). Borné aux membres (pas de fuite RG4). | Comportement indéfini en streaming. | DÉCISION SPEC: conserver fail-open borné (documenté limitation L3). Accepté comme limitation (non corrigé). | accepté (limitation documentée) |

## Notes
- Dette délibérée & prudente uniquement (CADRAGE R1). Toute dette imprudente = à refuser.
- Prioriser le remboursement par hotspots (complexité × churn), pas par laideur.
- Isolation client-side only (L1) : documentée comme limite, pas une dette à rembourser.

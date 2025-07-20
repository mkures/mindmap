# Cahier des Charges (Version Mise à Jour) – Micro App de Carte Mentale *from scratch*

> **But de cette mise à jour :** refléter la décision de **ne pas forker WiseMapping** et de développer une implémentation minimale autonome, orientée génération de code (ChatGPT / Codex), strictement alignée sur les besoins essentiels.

---
## 1. Objectif
Fournir une application web **offline**, mono‑utilisateur, ultra légère, permettant de créer, éditer, visualiser et exporter des cartes mentales (mind maps) avec :
- Ajout/édition rapide des nœuds (Tab / Entrée)
- Auto‑layout sans chevauchement
- Ajout d’emojis ou d’une **image unique** par nœud
- Zoom & pan fluides
- Export **PDF** (rendu visuel) + export **texte** (outline)
- Sauvegarde/chargement via **fichiers JSON locaux** (et option autosave LocalStorage)

Aucun backend, aucune collaboration, aucune authentification.

---
## 2. Portée (Scope)
**Inclus :** édition de cartes ; gestion hiérarchique ; auto‑layout ; import image locale ; emoji inline ; export PDF & texte ; persistance fichier ; interface minimaliste ; performance acceptable jusqu’à ~500 nœuds.

**Exclus :** multi‑utilisateur, temps réel, partage cloud, historique illimité/versions, thèmes complexes, tâches, liens externes enrichis, notes longues, import formats tiers.

---
## 3. Personas / Usage
- **Utilisateur unique (propriétaire)** : prend des notes structurées / brainstorm local.
- Contexte : Chromebook ou PC, mode hors‑ligne.

---
## 4. Fonctionnalités Fonctionnelles Clés
| ID | Fonction | Description | Priorité |
|----|----------|-------------|----------|
| F1 | Créer carte | Nouvelle carte avec un nœud racine vide | Must |
| F2 | Ajouter enfant (Tab) | Crée un nœud enfant du nœud sélectionné | Must |
| F3 | Ajouter frère (Enter) | Crée un nœud frère (même parent) | Must |
| F4 | Modifier texte | Double‑clic ou F2 pour inline edit | Must |
| F5 | Supprimer nœud | Del / bouton, supprime sous‑arbre | Must |
| F6 | Collapse/Expand | Toggle affichage des enfants | Should |
| F7 | Déplacement structurel | Changer parent via raccourci (Alt+Flèche) (optionnel phase 2) | Could |
| F8 | Auto‑layout | Réorganisation automatique sans chevauchement | Must |
| F9 | Zoom | Boutons +/−, Ctrl+Molette, Fit to screen | Must |
| F10 | Pan | Drag fond ou Space+Drag | Must |
| F11 | Image par nœud | Import fichier image, redimension et attache | Must |
| F12 | Emoji | Support Unicode dans texte nœud | Must |
| F13 | Export PDF | Rendu carte complète en PDF | Must |
| F14 | Export Texte | Outline hiérarchique en .txt ou .md | Must |
| F15 | Sauvegarde JSON | Download structure + images (base64) | Must |
| F16 | Chargement JSON | Import depuis fichier local | Must |
| F17 | Autosave | Sauvegarde périodique LocalStorage | Should |
| F18 | Palette couleurs auto | Couleur automatique des branches de 1er niveau | Should |
| F19 | PWA Offline | Manifest + Service Worker | Could |

---
## 5. Fonctionnalités Exclues (Explicites)
Undo/Redo complexe (on pourra faire un undo simple mémoire unique facultatif), multi‑sélection, lien entre nœuds non hiérarchiques, exports FreeMind/XMind, collaboration, comptes.

---
## 6. Architecture Technique
Application **SPA** pure front, fichiers statiques.

### 6.1 Fichiers / Modules
| Fichier | Rôle principal |
|---------|----------------|
| `index.html` | Structure DOM de base, toolbar, conteneur SVG |
| `styles.css` | Thème light, palette, layout UI |
| `main.js` | Point d’entrée, initialisation, orchestrateur |
| `model.js` | Modèle de données + CRUD nœuds |
| `layout.js` | Calcul positions (algorithme hiérarchique) |
| `render.js` | (Re)dessin du SVG (nœuds, liens) |
| `interaction.js` | Événements clavier/souris, navigation, pan/zoom |
| `media.js` | Import, traitement (resize) des images |
| `export.js` | Export PDF (SVG→Canvas→PDF) & export texte |
| `storage.js` | Sauvegarde/chargement JSON + autosave |
| `pwa.js` (opt) | Service Worker registration |

Découplage clair : `model` ne connaît pas le rendu ; `render` lit le snapshot model ; `layout` produit coords écrites dans le model avant render.

---
## 7. Modèle de Données
```ts
interface MindMap {
  id: string;
  title: string;
  rootId: string;
  nodes: Record<string, MindNode>;
  createdAt: number;
  updatedAt: number;
  version: 1;
}

interface MindNode {
  id: string;
  parentId: string | null; // null pour racine
  text: string;
  children: string[];      // ordre logique
  collapsed?: boolean;
  media?: NodeMedia;       // image ou emoji (emoji reste dans text, mais media pour future icône)
  color?: string;          // couleur branche (héritée du 1er ancêtre direct de niveau 1)
  x?: number; y?: number;  // coordonnées calculées
  w?: number; h?: number;  // dimensions (après mesure texte + image)
}

interface NodeMedia {
  kind: 'image';
  dataUrl: string;   // data:image/png;base64,... redimensionnée
  width: number;     // affiché
  height: number;    // affiché
  naturalWidth: number;
  naturalHeight: number;
  alt?: string;
}
```

**Invariants :**
- `children` cohérent avec `parentId`.
- Un nœud (hors racine) a exactement un parent.
- Un nœud possède au plus une `media`.

---
## 8. Algorithme de Layout
Choix : **Layout hiérarchique horizontal bilatéral** (simple, lisible) :
1. Répartir les enfants de la racine en deux colonnes (gauche/droite) de manière alternée (ou règle : moitié gauche, moitié droite) pour équilibrer visuellement.
2. Pour chaque sous‑arbre, utiliser un algorithme de type *Reingold–Tilford simplifié* :
   - Calcul récursif de la hauteur de chaque sous‑arbre = somme des hauteurs des enfants + gaps.
   - Position Y du nœud = moyenne des Y min/max de ses enfants (ou aligné si feuille).
   - Position X = profondeur * (NODE_WIDTH + H_GAP) avec signe négatif pour côté gauche.
3. Ajouter un espacement vertical constant `V_GAP` (ex: 24px).
4. Si un nœud est `collapsed`, ignorer ses descendants dans le layout (hauteur = hauteur d’un nœud simple).
5. Après placement, appliquer un recentrage global pour que la racine soit proche du centre du viewport.

Dimensions nœud :
- Mesure texte (canvas 2D invisible ou approximation par caractères * charWidth).
- Largeur = padding*2 + imageWidth + texteWidth (si image) ; hauteur = max(imageHeight, textHeight) + padding*2.

Complexité ~ O(N). Suffisant pour 500 nœuds.

---
## 9. Spécifications UI / UX
- **Toolbar minimale** : Boutons : New, Add Child, Add Sibling, Delete, Collapse, Image, Export PDF, Export TXT, Save JSON, Load JSON, Zoom -, Fit, Zoom +.
- **Canvas** : `<svg>` pleine fenêtre ; groupe `<g id="viewport">` transformé (translate + scale) pour pan/zoom.
- **Nœud** : Rect arrondi (rx=8), fond couleur pour profondeur 1, tons plus clairs pour niveaux suivants (ou héritage atténué). Texte centré verticalement.
- **Sélection** : Bordure plus épaisse ou glow.
- **Pan** : Cliquer fond + drag ; curseur "grab" / "grabbing".
- **Zoom** : Limit scale (0.25–2.0). Fit = calcul bounding box globale → scale & center.
- **Édition texte** : Double‑clic ouvre un `<foreignObject><input>` ou overlay input positionné au-dessus du nœud ; `Enter` confirme, `Esc` annule.
- **Image** : Affichée à gauche ; si largeur > 128, redimension proportionnel.
- **Messages** : Toast léger pour erreurs (ex: import JSON invalide).

---
## 10. Raccourcis Clavier
| Touche | Action |
|--------|--------|
| Tab | Ajouter enfant & sélectionner |
| Enter | Ajouter frère & sélectionner |
| Shift+Tab | Sélectionner parent |
| Flèches | Déplacer la sélection vers voisin logique (simplifié : parent / premier enfant / frère précédent / frère suivant) |
| Delete / Backspace | Supprimer nœud sélectionné (confirmation si comporte enfants) |
| Ctrl+S | Sauvegarder JSON (déclenche download) |
| Ctrl+O | Ouvrir fichier (ouvre input) |
| Ctrl++ / Ctrl+= | Zoom avant |
| Ctrl+- | Zoom arrière |
| Ctrl+0 | Fit to screen |
| F2 ou Double‑clic | Edit texte |
| Space + Drag | Pan |

---
## 11. Gestion des Images
- Input fichier caché (`accept="image/*"`).
- Limiter poids transformé : redimension max côté long = 256px (canvas offscreen) → PNG.
- Stockage base64 dans `dataUrl` (évite multi store), taille typique < ~30KB.
- Remplacement : nouvelle image écrase l’ancienne.
- Suppression : menu contextuel ou bouton (optionnel phase 2).

---
## 12. Persistance
### 12.1 Sauvegarde JSON
- `Export JSON` : sérialise objet MindMap (images inline base64). Nom : `mindmap-{title}-{timestamp}.json`.
- `Import JSON` : parse, valider `version`, reconstruire model.

### 12.2 Autosave (Should)
- Intervalle 5s debounced après modification → `localStorage['mindmap_autosave']`.
- Au démarrage : proposer restauration si présent.

---
## 13. Export Texte
Procédure DFS préfixée :
```
Racine
    Enfant 1
        Sous-enfant
    Enfant 2
```
- Indentation : 4 espaces.
- Fichier : `.txt` ou `.md`.
- Option : remplacer retours multiples par espace.

---
## 14. Export PDF
Étapes :
1. Cloner arbre SVG → calcul bounding box.
2. Créer canvas dimension (bbox * scaleFactor 2x pour netteté).
3. Dessiner liens (paths), nœuds (rect), texte (ctx.fillText), images (drawImage base64).
4. Intégrer image canvas dans jsPDF (format paysage si largeur > hauteur * 1.2).
5. Téléchargement `mindmap-{title}.pdf`.

Alternative rapide : utiliser `svg2pdf.js` si souhaité, mais base canvas simple suffit.

---
## 15. PWA (Optionnel)
- `manifest.json` (name, icons, start_url, display: standalone)
- `service-worker.js` : cache statique (CacheFirst) + fallback offline.
- Pas de sync arrière.

---
## 16. Performance & Budgets
| Élément | Budget |
|---------|--------|
| Redraw complet (N ≤ 300) | < 16 ms (1 frame) |
| Ajout nœud | < 50 ms (layout + redraw) |
| Export PDF (300 nœuds) | < 2 s |
| Mémoire images | < 20 MB (limiter nombre & taille) |

Optimisations : batch render (clear + rebuild), éviter listeners par nœud (event delegation), calcul layout O(N).

---
## 17. Sécurité / Confidentialité
- Aucune donnée sort du navigateur.
- Images uniquement locales, pas d’upload externe.
- JSON exporté ne contient aucune métadonnée cachée.

---
## 18. Plan d’Implémentation (Phases)
| Phase | Contenu | Livrable |
|-------|---------|----------|
| P0 | Scaffolding, model + root, render nœud simple | Affichage racine |
| P1 | Ajout/édition/suppression + layout basique | Arbre interactif texte |
| P2 | Pan & zoom + fit | Navigation fluide |
| P3 | Export texte + sauvegarde/chargement JSON | Fichiers ok |
| P4 | Images (import, affichage, redimension) | Nœuds imagés |
| P5 | Export PDF | PDF conforme |
| P6 | Collapse/Expand, autosave | Confort |
| P7 (opt) | PWA | Installable |

---
## 19. Critères d’Acceptation (Tests)
| ID | Test | Critère |
|----|------|---------|
| T1 | Tab crée enfant | Enfant apparaît positionné sans chevauchement |
| T2 | Enter crée frère | Frère inséré ordre correct |
| T3 | Delete nœud complexe | Sous‑arbre supprimé, pas d’orphelins |
| T4 | Import image 4000x3000 | Affiché ≤ 256px, aspect ratio respecté |
| T5 | Export texte | Outline cohérente avec hiérarchie |
| T6 | Export PDF | Tous nœuds visibles, lisibles, images incluses |
| T7 | Autosave | Rechargement propose restauration fidèle |
| T8 | 300 nœuds ajoutés script | Interface reste réactive (zoom < 200ms) |
| T9 | Collapse branche | Descendants masqués, layout se referme |
| T10 | Fit to screen | Carte entière visible sans scroll |

---
## 20. Extensions Futures (Hors Scope)
Undo multi‑niveaux, recherche de texte, multi‑sélection, liens croisés, styles personnalisables, thèmes sombres avancés, export FreeMind, import MindMeister.

---
## 21. Exemple JSON Export
```json
{
  "id": "map-uuid",
  "title": "Ma Carte",
  "rootId": "n1",
  "version": 1,
  "createdAt": 1737400000000,
  "updatedAt": 1737400500000,
  "nodes": {
    "n1": {"id":"n1","parentId":null,"text":"Idée centrale","children":["n2","n3"],"color":"#ff6f59"},
    "n2": {"id":"n2","parentId":"n1","text":"Branche A","children":[],"color":"#ff6f59"},
    "n3": {"id":"n3","parentId":"n1","text":"Branche B","children":["n4"],"color":"#43aa8b"},
    "n4": {"id":"n4","parentId":"n3","text":"Sous-idee","children":[],"color":"#43aa8b", "media": {"kind":"image","dataUrl":"data:image/png;base64,iVBOR...","width":96,"height":64,"naturalWidth":600,"naturalHeight":400}}
  }
}
```

---
## 22. Glossaire
- **Auto‑layout** : Placement automatique des nœuds selon l’arbre.
- **Outline** : Représentation textuelle hiérarchique indentée.
- **PWA** : Progressive Web App (installation & offline).
- **Data URL** : Encodage base64 d’un contenu binaire dans une chaîne.

---
## 23. Résumé Décisionnel
Le développement *from scratch* est choisi pour : rapidité, maîtrise, absence de dette héritée, et alignement exact avec le périmètre restreint. Le cahier présent est calibré pour qu’un moteur de génération de code produise un MVP fiable et extensible.

---
**Fin du document.**


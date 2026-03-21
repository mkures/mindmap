/**
 * Map templates — pre-built structures for common use cases
 */

const TEMPLATES = [
    {
        name: 'Carte vide',
        icon: '○',
        build: () => null // signals "use createEmptyMap"
    },
    {
        name: 'Brainstorming',
        icon: '💡',
        build: () => ({
            title: 'Brainstorming',
            rootId: 'n1',
            nodes: {
                n1: { id: 'n1', parentId: null, text: 'Sujet', children: ['n2','n3','n4'], color: '#ffffff' },
                n2: { id: 'n2', parentId: 'n1', text: 'Idée 1', children: [], color: '#fef3c7', side: 'right' },
                n3: { id: 'n3', parentId: 'n1', text: 'Idée 2', children: [], color: '#bfdbfe', side: 'right' },
                n4: { id: 'n4', parentId: 'n1', text: 'Idée 3', children: [], color: '#bbf7d0', side: 'left' },
            }
        })
    },
    {
        name: 'Projet',
        icon: '📋',
        build: () => ({
            title: 'Projet',
            rootId: 'n1',
            nodes: {
                n1: { id: 'n1', parentId: null, text: 'Nom du projet', children: ['n2','n3','n4','n5'], color: '#ffffff' },
                n2: { id: 'n2', parentId: 'n1', text: 'Objectifs', children: ['n6','n7'], color: '#bbf7d0', side: 'right' },
                n3: { id: 'n3', parentId: 'n1', text: 'Ressources', children: [], color: '#bfdbfe', side: 'right' },
                n4: { id: 'n4', parentId: 'n1', text: 'Échéances', children: [], color: '#fef3c7', side: 'left' },
                n5: { id: 'n5', parentId: 'n1', text: 'Risques', children: [], color: '#fecaca', side: 'left' },
                n6: { id: 'n6', parentId: 'n2', text: 'Objectif 1', children: [], color: '#bbf7d0' },
                n7: { id: 'n7', parentId: 'n2', text: 'Objectif 2', children: [], color: '#bbf7d0' },
            }
        })
    },
    {
        name: 'SWOT',
        icon: '📊',
        build: () => ({
            title: 'Analyse SWOT',
            rootId: 'n1',
            nodes: {
                n1: { id: 'n1', parentId: null, text: 'Analyse SWOT', children: ['n2','n3','n4','n5'], color: '#ffffff' },
                n2: { id: 'n2', parentId: 'n1', text: 'Forces', children: [], color: '#bbf7d0', side: 'right' },
                n3: { id: 'n3', parentId: 'n1', text: 'Faiblesses', children: [], color: '#fecaca', side: 'right' },
                n4: { id: 'n4', parentId: 'n1', text: 'Opportunités', children: [], color: '#bfdbfe', side: 'left' },
                n5: { id: 'n5', parentId: 'n1', text: 'Menaces', children: [], color: '#fef3c7', side: 'left' },
            }
        })
    },
    {
        name: 'Réunion',
        icon: '📝',
        build: () => ({
            title: 'Compte-rendu',
            rootId: 'n1',
            nodes: {
                n1: { id: 'n1', parentId: null, text: 'Réunion — [date]', children: ['n2','n3','n4','n5'], color: '#ffffff' },
                n2: { id: 'n2', parentId: 'n1', text: 'Ordre du jour', children: [], color: '#bfdbfe', side: 'right' },
                n3: { id: 'n3', parentId: 'n1', text: 'Décisions', children: [], color: '#bbf7d0', side: 'right' },
                n4: { id: 'n4', parentId: 'n1', text: 'Actions', children: [], color: '#fef3c7', side: 'left' },
                n5: { id: 'n5', parentId: 'n1', text: 'Questions ouvertes', children: [], color: '#fecaca', side: 'left' },
            }
        })
    },
    {
        name: 'Pour / Contre',
        icon: '⚖️',
        build: () => ({
            title: 'Pour / Contre',
            rootId: 'n1',
            nodes: {
                n1: { id: 'n1', parentId: null, text: 'Décision ?', children: ['n2','n3'], color: '#ffffff' },
                n2: { id: 'n2', parentId: 'n1', text: 'Pour ✓', children: ['n4'], color: '#bbf7d0', side: 'right' },
                n3: { id: 'n3', parentId: 'n1', text: 'Contre ✗', children: ['n5'], color: '#fecaca', side: 'left' },
                n4: { id: 'n4', parentId: 'n2', text: 'Argument 1', children: [], color: '#bbf7d0' },
                n5: { id: 'n5', parentId: 'n3', text: 'Argument 1', children: [], color: '#fecaca' },
            }
        })
    }
];

export function getTemplates() {
    return TEMPLATES;
}

export function buildFromTemplate(index) {
    const tmpl = TEMPLATES[index];
    if (!tmpl) return null;
    const raw = tmpl.build();
    if (!raw) return null; // empty map
    return {
        id: 'map-' + Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        ...raw
    };
}

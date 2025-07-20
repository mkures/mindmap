export function render(map, svg, selectedId) {
    svg.innerHTML = '';
    for (const id in map.nodes) {
        const node = map.nodes[id];
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.classList.add('node');
        g.setAttribute('data-id', id);
        if (id === selectedId) g.classList.add('selected');
        g.setAttribute('transform', `translate(${node.x},${node.y})`);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', node.w);
        rect.setAttribute('height', node.h);
        g.appendChild(rect);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', 10);
        text.setAttribute('y', 25);
        text.textContent = node.text;
        g.appendChild(text);

        svg.appendChild(g);
    }
}

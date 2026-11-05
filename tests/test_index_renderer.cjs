/** Dependency-free renderer regression checks (Node.js 18+). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'courses.json'), 'utf8'));
const script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>\s*<noscript>/);
const embedded = html.match(/<script id="embeddedCourses" type="application\/json">\s*([\s\S]*?)\s*<\/script>/);
assert.ok(script, 'index.html must contain the catalog renderer');
assert.ok(embedded, 'index.html must contain the offline catalog snapshot');

class Element {
    constructor(tag = 'div') {
        this.tag = tag;
        this.children = [];
        this.innerHTML = '';
        this.textContent = '';
        this.className = '';
        this.href = '';
    }
    appendChild(child) { this.children.push(child); }
}

async function render(raw) {
    const container = new Element();
    const emoji = new Element();
    const title = new Element();
    const subtitle = new Element();
    const footer = new Element();
    const embeddedData = new Element('script');
    embeddedData.textContent = raw;
    const selectors = {
        '.header .emoji': emoji,
        '.header .title-text': title,
        '.header .sub': subtitle,
        '.footer': footer,
    };
    const document = {
        title: '',
        getElementById: id => id === 'cardContainer' ? container : id === 'embeddedCourses' ? embeddedData : null,
        querySelector: selector => selectors[selector],
        createElement: tag => new Element(tag),
    };
    // No fetch, network, filesystem, process or require is exposed to the renderer.
    vm.runInNewContext(script[1], { document, Promise, JSON, Error }, { timeout: 1000 });
    await new Promise(resolve => setImmediate(resolve));
    return { document, container, footer };
}

test('offline catalog renders all 28 chapters with local navigation links', async () => {
    assert.deepEqual(JSON.parse(embedded[1]), catalog);
    const result = await render(embedded[1]);
    assert.equal(result.document.title, catalog.title + ' · 课程目录');
    assert.equal(result.container.children.length, 28);
    for (let i = 0; i < catalog.chapters.length; i++) {
        const card = result.container.children[i];
        assert.equal(card.className, 'card');
        assert.equal(card.children[0].children[1].textContent, catalog.chapters[i].title);
        assert.equal(card.children.at(-1).children[0].href, catalog.chapters[i].file);
    }
    assert.match(result.footer.innerHTML, /28章/);
});

test('empty catalog displays a meaningful empty state', async () => {
    const result = await render(JSON.stringify({ ...catalog, chapters: [] }));
    assert.match(result.container.innerHTML, /暂无课程数据/);
});

test('malformed embedded catalog shows an error instead of blank screen', async () => {
    const result = await render('{bad json');
    assert.equal(result.container.children.length, 0);
    assert.match(result.container.innerHTML, /课程数据加载失败/);
});

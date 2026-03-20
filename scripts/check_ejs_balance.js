const fs = require('fs');
const path = process.argv[2] || 'views/public/home.ejs';
const s = fs.readFileSync(path, 'utf8');
const re = /<%([=\-]?)([\s\S]*?)%>/g;
let m;
let blockIndex = 0;
let errors = 0;
while ((m = re.exec(s)) !== null) {
    blockIndex++;
    const sig = m[1];
    const code = m[2];
    // Basic balance checks for (), {}, []
    const pairs = { '(': 0, ')': 0, '{': 0, '}': 0, '[': 0, ']': 0 };
    for (let i = 0; i < code.length; i++) {
        const ch = code[i];
        if (pairs.hasOwnProperty(ch)) pairs[ch]++;
    }
    const openParens = pairs['('];
    const closeParens = pairs[')'];
    const openBraces = pairs['{'];
    const closeBraces = pairs['}'];
    const openBrackets = pairs['['];
    const closeBrackets = pairs[']'];
    if (openParens !== closeParens || openBraces !== closeBraces || openBrackets !== closeBrackets) {
        console.log(`Block #${blockIndex} (type '<%${sig}%>') imbalance in ${path}:`);
        console.log('--- code start ---');
        console.log(code.trim().split('\n').slice(0, 10).join('\n'));
        console.log('--- code end ---');
        console.log(`counts: ( ${openParens} vs ) ${closeParens}, { ${openBraces} vs } ${closeBraces}, [ ${openBrackets} vs ] ${closeBrackets}`);
        console.log('');
        errors++;
    }
}
if (errors === 0) {
    console.log('No imbalances detected in EJS code blocks for', path);
} else {
    console.log('Found', errors, 'blocks with imbalances');
}

(function initializeNewspaperExport(){
  'use strict';

  function safeAscii(value){
    return String(value ?? '')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[—–]/g, '-')
      .replace(/…/g, '...')
      .replace(/·/g, '-')
      .replace(/[^\x20-\x7E]/g, '');
  }

  function fileBase(data){
    const season = Number(data?.season) || 'season';
    const week = Number(data?.week) || 'week';
    return `1048-gate-${season}-week-${week}`;
  }

  function pdfEscape(value){
    return safeAscii(value).replace(/([\\()])/g, '\\$1');
  }

  function wrapText(value, maxCharacters){
    const words = safeAscii(value).trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(word => {
      const next = line ? `${line} ${word}` : word;
      if(next.length <= maxCharacters || !line){
        line = next;
      }else{
        lines.push(line);
        line = word;
      }
    });
    if(line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function editionSections(data){
    const sections = [];
    const seen = new Set();
    const add = section => {
      if(!section?.body) return;
      const key = `${String(section.title || '').trim().toLowerCase()}|${String(section.body).trim().toLowerCase()}`;
      if(seen.has(key)) return;
      seen.add(key);
      sections.push(section);
    };
    const lead = data.lead || {};
    const matchup = data.matchup || {};
    add({label:'Lead story', title:lead.title || 'The week in view', body:lead.body});
    if(matchup.awayTeam){
      const awayWon = Number(matchup.awayScore) >= Number(matchup.homeScore);
      const first = awayWon
        ? {team:matchup.awayTeam, owner:matchup.awayOwner, score:matchup.awayScore}
        : {team:matchup.homeTeam, owner:matchup.homeOwner, score:matchup.homeScore};
      const second = awayWon
        ? {team:matchup.homeTeam, owner:matchup.homeOwner, score:matchup.homeScore}
        : {team:matchup.awayTeam, owner:matchup.awayOwner, score:matchup.awayScore};
      const score = `${first.team} (${first.owner}) ${first.score ?? '-'} - ${second.score ?? '-'} ${second.team} (${second.owner})`;
      add({label:'Matchup of the week', title:score, body:[matchup.whyItMatters, matchup.edge].filter(Boolean).join(' ')});
    }
    const table = Array.isArray(data.tableNotes) ? data.tableNotes : [];
    if(table.length){
      add({
        label:table.length === 12 ? 'The full table' : 'Top of the table',
        title:table.length === 12 ? 'All 12 clubs after the week' : 'Standings snapshot',
        compact:true,
        body:table.map(note => `${String(note.rank).padStart(2, '0')}  ${note.team} (${note.owner})  ${note.record}  ${note.pointsFor} PF`).join('\n')
      });
    }
    const editorialNotes = [[data.pressure, data.pressure?.label || 'Early read'], [data.surprise, 'Biggest surprise']];
    for(const [item, label] of editorialNotes){
      if(item?.body) add({label, title:item.title || item.team || 'League note', body:item.body});
    }
    const power = Array.isArray(data.powerTable) ? data.powerTable : [];
    if(power.length){
      add({label:'Power rankings', title:'The complete 1–12 early order', compact:true, body:power.map(row => `${String(row.rank).padStart(2, '0')}  ${row.team} (${row.owner})  ${row.rating}  ·  ${row.record}  ·  ${row.why}`).join('\n')});
    }
    const results = Array.isArray(data.results) ? data.results : [];
    if(results.length){
      add({label:`Week ${data.week} results`, title:'The complete six-game board', compact:true, body:results.map(game => `${game.winnerTeam} (${game.winnerOwner}) ${game.winnerScore}  ·  ${game.loserTeam} (${game.loserOwner}) ${game.loserScore}`).join('\n')});
    }
    const records = Array.isArray(data.recordBook) ? data.recordBook : [];
    if(data.recordWatch?.body || records.length){
      add({label:'Record book', title:data.recordWatch?.title || 'The archive benchmarks', compact:true, body:[data.recordWatch?.body, ...records.map(row => `${row.label.toUpperCase()}  ${row.value}`)].filter(Boolean).join('\n')});
    }
    if(data.rivalryFile?.body) add({label:'Rivalry file', title:data.rivalryFile.title, body:data.rivalryFile.body});
    const nextSlate = Array.isArray(data.nextSlate) ? data.nextSlate : [];
    if(nextSlate.length){
      add({label:'Next week', title:`Week ${Number(data.week) + 1} slate`, compact:true, body:nextSlate.map(game => `${game.awayTeam} (${game.awayOwner}) vs. ${game.homeTeam} (${game.homeOwner})`).join('\n')});
    }
    if(data.archiveComparison?.body) add({label:'From the archive', title:data.archiveComparison.title || 'Archive note', body:data.archiveComparison.body});
    const coveredTypes = new Set(['matchup_recap','closest_game','scoring_leaders','standings','record_watch','rivalry','power_rankings','preseason_order_watch','next_week']);
    (Array.isArray(data.stories) ? data.stories : []).filter(story => !coveredTypes.has(story.story_type)).forEach(story => add({
      label:String(story.story_type || 'League story').replaceAll('_', ' '),
      title:story.title,
      body:story.body
    }));
    return sections;
  }

  function buildWeeklyPdf(data){
    const pages = [];
    let commands = [];
    let y = 744;

    function startPage(){
      commands = ['0.09 0.12 0.13 rg'];
      y = 744;
    }
    function finishPage(){
      commands.push('0.35 0.39 0.40 rg', 'BT /F1 8 Tf 54 28 Td (1048gate.com - verified league edition) Tj ET');
      pages.push(commands.join('\n'));
    }
    function ensure(height){
      if(y - height >= 54) return;
      finishPage();
      startPage();
    }
    function textLine(value, {size=11, font='F1', x=54, leading=size * 1.35, color='0.15 0.20 0.21'} = {}){
      ensure(leading + 2);
      commands.push(`${color} rg`, `BT /${font} ${size} Tf ${x} ${y.toFixed(1)} Td (${pdfEscape(value)}) Tj ET`);
      y -= leading;
    }
    function paragraph(value, {size=11, font='F1', x=54, width=504, leading=size * 1.45, color='0.15 0.20 0.21'} = {}){
      String(value || '').split('\n').forEach(block => {
        const maxCharacters = Math.max(20, Math.floor(width / (size * 0.52)));
        wrapText(block, maxCharacters).forEach(line => textLine(line, {size, font, x, leading, color}));
      });
    }
    function rule(){
      ensure(18);
      commands.push('0.48 0.36 0.19 RG', `54 ${y.toFixed(1)} m 558 ${y.toFixed(1)} l S`);
      y -= 18;
    }

    startPage();
    textLine('1048 GATE WEEKLY', {size:14, font:'F2', leading:24, color:'0.48 0.36 0.19'});
    textLine(`SEASON ${data.season} - WEEK ${data.week} - ${data.status === 'live' ? 'LIVE' : 'FINAL'}`, {size:9, font:'F2', leading:24, color:'0.35 0.39 0.40'});
    paragraph(data.headline || `Week ${data.week} Edition`, {size:25, font:'F2', leading:30});
    y -= 5;
    paragraph(data.standfirst || '', {size:12, leading:18, color:'0.30 0.35 0.36'});
    y -= 8;
    rule();

    editionSections(data).forEach(section => {
      ensure(92);
      textLine(String(section.label || '').toUpperCase(), {size:8, font:'F2', leading:15, color:'0.48 0.36 0.19'});
      paragraph(section.title || '', {size:15, font:'F2', leading:19});
      y -= 3;
      paragraph(section.body || '', {size:10.5, leading:15});
      y -= 12;
    });
    finishPage();

    const pageObjectIds = pages.map((_, index) => 5 + (index * 2));
    const objects = [];
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
    pages.forEach((content, index) => {
      const pageId = 5 + (index * 2);
      const contentId = pageId + 1;
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    });

    const encoder = new TextEncoder();
    const chunks = ['%PDF-1.4\n'];
    const offsets = [0];
    let byteLength = encoder.encode(chunks[0]).length;
    for(let id = 1; id < objects.length; id++){
      offsets[id] = byteLength;
      const chunk = `${id} 0 obj\n${objects[id]}\nendobj\n`;
      chunks.push(chunk);
      byteLength += encoder.encode(chunk).length;
    }
    const xrefOffset = byteLength;
    const xref = [`xref\n0 ${objects.length}\n`, '0000000000 65535 f \n'];
    for(let id = 1; id < objects.length; id++) xref.push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
    xref.push(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    chunks.push(xref.join(''));
    return encoder.encode(chunks.join(''));
  }

  function downloadBlob(blob, filename){
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadPdf(data){
    let bytes;
    try{
      bytes = await createNewspaperPdf(data);
    }catch(error){
      console.warn('Falling back to the text edition PDF:', error);
      bytes = buildWeeklyPdf(data);
    }
    downloadBlob(new Blob([bytes], {type:'application/pdf'}), `${fileBase(data)}-edition.pdf`);
  }

  function canvasLines(context, value, maxWidth){
    const words = String(value || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(word => {
      const next = line ? `${line} ${word}` : word;
      if(!line || context.measureText(next).width <= maxWidth) line = next;
      else { lines.push(line); line = word; }
    });
    if(line) lines.push(line);
    return lines;
  }

  function canvasParagraphLines(context, value, maxWidth){
    return String(value || '').split('\n').flatMap(paragraph => canvasLines(context, paragraph, maxWidth));
  }

  function canvasBlob(canvas, type, quality){
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed.')), type, quality));
  }

  /* ---- Full-edition page layout -------------------------------------------
     The PDF and page images are drawn on a canvas, so they never read the
     site's CSS. Every string is measured in the exact font, size and case it
     is drawn in, words wider than the column are broken, and oversized
     sections are split across pages, so nothing can run past the page edge
     whatever fonts the device has. System font stacks only: no web fonts are
     loaded (they were removed from the site), and the metric-compatible
     ChromeOS/Linux faces (Tinos, Arimo, Liberation) are listed explicitly.
     Colours are fixed newsprint light regardless of the site theme. */
  const PAGE_WIDTH = 1080;
  const PAGE_HEIGHT = 1398; // 1080 x 1398 is the US Letter 8.5 x 11 in aspect ratio
  const LEFT = 78;
  const CONTENT_WIDTH = 924;
  const RIGHT = LEFT + CONTENT_WIDTH;
  const CONTINUATION_TOP = 150;
  const BOTTOM = 1270;
  const FONTS = {
    serif:'Georgia, "Times New Roman", Tinos, "Liberation Serif", "Noto Serif", serif',
    sans:'"Helvetica Neue", Helvetica, Arial, Arimo, "Liberation Sans", sans-serif'
  };
  const INK = {paper:'#f3ead9', rule:'#b98a52', frame:'#1b292b', head:'#172022', body:'#273234', deck:'#435153', label:'#7b5b2f', meta:'#596568'};

  const fontSpec = (weight, size, family) => `${weight} ${size}px ${family}`;

  /* Greedy wrap by measured width; a single word wider than the column is
     broken by characters so it can never overflow. */
  function measuredLines(context, value, maxWidth){
    const lines = [];
    String(value ?? '').split('\n').forEach(paragraph => {
      let line = '';
      paragraph.split(/\s+/).filter(Boolean).forEach(word => {
        const next = line ? `${line} ${word}` : word;
        if(context.measureText(next).width <= maxWidth){ line = next; return; }
        if(line) lines.push(line);
        line = '';
        if(context.measureText(word).width <= maxWidth){ line = word; return; }
        let chunk = '';
        for(const character of Array.from(word)){
          if(chunk && context.measureText(chunk + character).width > maxWidth){ lines.push(chunk); chunk = character; }
          else chunk += character;
        }
        line = chunk;
      });
      lines.push(line);
    });
    while(lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    return lines;
  }

  /* Wrap text, stepping the size down until it fits in maxLines. Text is
     never dropped: at the minimum size every line is kept. */
  function fitBlockText(context, value, {weight, family, size, minSize, maxLines = Infinity, upper = false, leading = 1.2}){
    const text = upper ? String(value ?? '').toUpperCase() : String(value ?? '');
    for(let current = size; ; current -= 2){
      const nextSize = Math.max(minSize, current);
      context.font = fontSpec(weight, nextSize, family);
      const lines = measuredLines(context, text, CONTENT_WIDTH);
      if(lines.length <= maxLines || nextSize <= minSize){
        return {lines, font:context.font, size:nextSize, leading:Math.round(nextSize * leading)};
      }
    }
  }

  /* One-line text (masthead, footer): shrink to fit, then shorten with an
     ellipsis as a last resort. */
  function fitLine(context, value, maxWidth, {weight, family, size, minSize}){
    let text = String(value ?? '');
    for(let current = size; current >= minSize; current -= 1){
      context.font = fontSpec(weight, current, family);
      if(context.measureText(text).width <= maxWidth) return {text, font:context.font};
    }
    context.font = fontSpec(weight, minSize, family);
    while(text.length > 1 && context.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
    return {text:`${text}…`, font:context.font};
  }

  function pulledLabel(value){
    const date = new Date(value);
    if(!value || Number.isNaN(date.getTime())) return value ? String(value) : 'UNAVAILABLE';
    return `${new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York', month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit'}).format(date).toUpperCase()} ET`;
  }

  const LABEL = {size:16, leading:22};
  const BLOCK_PAD_TOP = 14, LABEL_GAP = 4, TITLE_GAP = 8, BLOCK_PAD_BOTTOM = 22;

  function blockHeight(block){
    return BLOCK_PAD_TOP + (block.labelLines.length * LABEL.leading) + LABEL_GAP
      + (block.title.lines.length * block.title.leading) + TITLE_GAP
      + (block.bodyLines.length * block.bodyLeading) + BLOCK_PAD_BOTTOM;
  }

  function layoutEdition(context, data){
    const headline = fitBlockText(context, data.headline || `Week ${data.week} Edition`, {weight:700, family:FONTS.serif, size:54, minSize:36, maxLines:4, leading:1.14});
    const standfirst = fitBlockText(context, data.standfirst || '', {weight:400, family:FONTS.serif, size:24, minSize:20, maxLines:5, leading:1.42});
    const headlineTop = 206;
    const standfirstTop = headlineTop + (headline.lines.length * headline.leading) + 6;
    const deckRule = standfirstTop + (standfirst.lines.filter(Boolean).length ? (standfirst.lines.length * standfirst.leading) : 0);
    const firstContentTop = deckRule + 36;

    const blocks = [];
    editionSections(data).forEach(section => {
      context.font = fontSpec(700, LABEL.size, FONTS.sans);
      const labelLines = measuredLines(context, String(section.label || 'League story').toUpperCase(), CONTENT_WIDTH);
      const title = fitBlockText(context, section.title || '', {weight:700, family:FONTS.serif, size:30, minSize:22, maxLines:3, leading:1.2});
      const bodySize = section.compact ? 17 : 21;
      const bodyLeading = section.compact ? 24 : 29;
      context.font = fontSpec(400, bodySize, FONTS.serif);
      const bodyLines = measuredLines(context, section.body || '', CONTENT_WIDTH);
      const block = {label:section.label, labelLines, title, bodyLines, bodySize, bodyLeading};
      const pageCapacity = BOTTOM - CONTINUATION_TOP;
      if(blockHeight(block) <= pageCapacity){ blocks.push({...block, height:blockHeight(block)}); return; }
      /* Taller than a whole page: split the body across pages. */
      const fixed = blockHeight({...block, bodyLines:[]});
      const perPage = Math.max(1, Math.floor((pageCapacity - fixed) / bodyLeading));
      for(let index = 0; index < bodyLines.length; index += perPage){
        const part = {...block, bodyLines:bodyLines.slice(index, index + perPage)};
        if(index){
          context.font = fontSpec(700, LABEL.size, FONTS.sans);
          part.labelLines = measuredLines(context, `${String(section.label || 'League story').toUpperCase()} (CONTINUED)`, CONTENT_WIDTH);
        }
        blocks.push({...part, height:blockHeight(part)});
      }
    });

    const groups = [[]];
    const used = [0];
    blocks.forEach(block => {
      const page = groups.length - 1;
      const capacity = BOTTOM - (page === 0 ? firstContentTop : CONTINUATION_TOP);
      if(used[page] + block.height > capacity && (groups[page].length || page === 0)){
        if(!groups[page].length && page === 0){ groups[0] = []; }
        groups.push([block]);
        used.push(block.height);
      }else{
        groups[page].push(block);
        used[page] += block.height;
      }
    });
    if(groups.length > 1){
      const lastIndex = groups.length - 1;
      const continuationCapacity = BOTTOM - CONTINUATION_TOP;
      while(used[lastIndex] < continuationCapacity * .62 && groups[lastIndex - 1].length > 1){
        const candidate = groups[lastIndex - 1][groups[lastIndex - 1].length - 1];
        if(used[lastIndex] + candidate.height > continuationCapacity) break;
        groups[lastIndex - 1].pop();
        used[lastIndex - 1] -= candidate.height;
        groups[lastIndex].unshift(candidate);
        used[lastIndex] += candidate.height;
      }
    }
    const pages = groups.map((group, page) => {
      let y = page === 0 ? firstContentTop : CONTINUATION_TOP;
      return group.map(block => { const placed = {...block, y}; y += block.height; return placed; });
    });
    return {headline, standfirst, headlineTop, standfirstTop, deckRule, pages, pageCount:pages.length};
  }

  function drawEditionPage(context, data, layout, pageIndex, offset = 0){
    const {pageCount} = layout;
    context.textAlign = 'left';
    context.fillStyle = INK.paper;
    context.fillRect(0, offset, PAGE_WIDTH, PAGE_HEIGHT);
    context.strokeStyle = INK.rule;
    context.lineWidth = 4;
    context.strokeRect(38, offset + 38, 1004, 1322);
    context.strokeStyle = INK.frame;
    context.lineWidth = 2;
    context.strokeRect(52, offset + 52, 976, 1294);

    /* Masthead: right-hand week tag first, then the title fits the space left. */
    const tag = fitLine(context, `WEEK ${data.week}  /  ${data.status === 'live' ? 'LIVE' : 'FINAL'}`, 280, {weight:700, family:FONTS.sans, size:19, minSize:13});
    context.font = tag.font;
    const tagWidth = context.measureText(tag.text).width;
    const title = fitLine(context, pageIndex ? '1048 GATE WEEKLY · CONTINUED' : '1048 GATE WEEKLY', CONTENT_WIDTH - tagWidth - 28, {weight:700, family:FONTS.serif, size:44, minSize:26});
    context.fillStyle = INK.frame;
    context.font = title.font;
    context.fillText(title.text, LEFT, offset + 112);
    context.textAlign = 'right';
    context.fillStyle = INK.label;
    context.font = tag.font;
    context.fillText(tag.text, RIGHT, offset + 108);
    context.textAlign = 'left';
    context.fillStyle = INK.frame;
    context.fillRect(LEFT, offset + 132, CONTENT_WIDTH, 4);

    /* Footer: page number on the right, source line fits what remains. */
    const pageLabel = `PAGE ${pageIndex + 1} OF ${pageCount}`;
    context.font = fontSpec(700, 13, FONTS.sans);
    const pageLabelWidth = context.measureText(pageLabel).width;
    const sourceStatus = data.source_status === 'verified_live' ? 'ESPN LIVE SNAPSHOT' : 'ESPN FINAL';
    const source = fitLine(context, `SOURCE: ${sourceStatus}  ·  PULLED ${pulledLabel(data.generated_at || data.updated_at)}`, CONTENT_WIDTH - pageLabelWidth - 24, {weight:700, family:FONTS.sans, size:13, minSize:10});
    context.fillStyle = INK.meta;
    context.font = source.font;
    context.fillText(source.text, LEFT, offset + 1318);
    context.textAlign = 'right';
    context.font = fontSpec(700, 13, FONTS.sans);
    context.fillText(pageLabel, RIGHT, offset + 1318);
    context.textAlign = 'left';

    if(pageIndex === 0){
      context.fillStyle = INK.frame;
      context.font = layout.headline.font;
      layout.headline.lines.forEach((line, index) => context.fillText(line, LEFT, offset + layout.headlineTop + (index * layout.headline.leading)));
      context.fillStyle = INK.deck;
      context.font = layout.standfirst.font;
      layout.standfirst.lines.forEach((line, index) => context.fillText(line, LEFT, offset + layout.standfirstTop + 22 + (index * layout.standfirst.leading)));
      context.fillStyle = INK.label;
      context.fillRect(LEFT, offset + layout.deckRule + 14, CONTENT_WIDTH, 3);
    }

    (layout.pages[pageIndex] || []).forEach(block => {
      let y = offset + block.y;
      context.strokeStyle = 'rgba(39,50,52,.34)';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(LEFT, y);
      context.lineTo(RIGHT, y);
      context.stroke();
      y += BLOCK_PAD_TOP;
      context.fillStyle = INK.label;
      context.font = fontSpec(700, LABEL.size, FONTS.sans);
      block.labelLines.forEach(line => { y += LABEL.leading * .8; context.fillText(line, LEFT, y); y += LABEL.leading * .2; });
      y += LABEL_GAP;
      context.fillStyle = INK.head;
      context.font = block.title.font;
      block.title.lines.forEach(line => { y += block.title.leading * .82; context.fillText(line, LEFT, y); y += block.title.leading * .18; });
      y += TITLE_GAP;
      context.fillStyle = INK.body;
      context.font = fontSpec(400, block.bodySize, FONTS.serif);
      block.bodyLines.forEach(line => { y += block.bodyLeading * .8; context.fillText(line, LEFT, y); y += block.bodyLeading * .2; });
    });
  }

  async function editionLayout(data){
    if(document.fonts?.ready) await document.fonts.ready;
    const measure = document.createElement('canvas').getContext('2d');
    return layoutEdition(measure, data);
  }

  /* One tall canvas holding every page (kept for callers/tests). The export
     paths below draw each page on its own canvas instead, which stays well
     inside iOS Safari's canvas memory limit for long editions. */
  async function createFullEditionCanvas(data){
    const layout = await editionLayout(data);
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_WIDTH;
    canvas.height = PAGE_HEIGHT * layout.pageCount;
    const context = canvas.getContext('2d');
    for(let pageIndex = 0; pageIndex < layout.pageCount; pageIndex++) drawEditionPage(context, data, layout, pageIndex, pageIndex * PAGE_HEIGHT);
    return canvas;
  }

  function concatBytes(parts){
    const length = parts.reduce((total, part) => total + part.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    parts.forEach(part => { result.set(part, offset); offset += part.length; });
    return result;
  }

  function buildImagePdf(jpegPages, width, height){
    const encoder = new TextEncoder();
    const ascii = value => encoder.encode(value);
    const pageIds = jpegPages.map((_, index) => 3 + (index * 3));
    const objects = [];
    objects[1] = ascii('<< /Type /Catalog /Pages 2 0 R >>');
    objects[2] = ascii(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
    jpegPages.forEach((jpeg, index) => {
      const pageId = 3 + (index * 3);
      const contentId = pageId + 1;
      const imageId = pageId + 2;
      const imageName = `Im${index}`;
      /* Fit the page image inside US Letter (612 x 792 pt) without
         distortion, centred; the paper colour fills any sliver left over. */
      const fit = Math.min(612 / width, 792 / height);
      const drawWidth = +(width * fit).toFixed(3), drawHeight = +(height * fit).toFixed(3);
      const x = +((612 - drawWidth) / 2).toFixed(3), y = +((792 - drawHeight) / 2).toFixed(3);
      const content = `q\n0.953 0.918 0.851 rg\n0 0 612 792 re f\nQ\nq\n${drawWidth} 0 0 ${drawHeight} ${x} ${y} cm\n/${imageName} Do\nQ`;
      objects[pageId] = ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /${imageName} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
      objects[contentId] = ascii(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      objects[imageId] = concatBytes([
        ascii(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
        jpeg,
        ascii('\nendstream')
      ]);
    });

    const output = [ascii('%PDF-1.4\n')];
    const offsets = [0];
    let length = output[0].length;
    for(let id = 1; id < objects.length; id++){
      offsets[id] = length;
      const object = concatBytes([ascii(`${id} 0 obj\n`), objects[id], ascii('\nendobj\n')]);
      output.push(object);
      length += object.length;
    }
    const xrefOffset = length;
    const xref = [`xref\n0 ${objects.length}\n`, '0000000000 65535 f \n'];
    for(let id = 1; id < objects.length; id++) xref.push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
    xref.push(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    output.push(ascii(xref.join('')));
    return concatBytes(output);
  }

  async function createEditionPageBlobs(data, type='image/png', quality, scale = 1){
    const layout = await editionLayout(data);
    const pages = [];
    const width = Math.round(PAGE_WIDTH * scale);
    const height = Math.round(PAGE_HEIGHT * scale);
    for(let pageIndex = 0; pageIndex < layout.pageCount; pageIndex++){
      const page = document.createElement('canvas');
      page.width = width;
      page.height = height;
      const context = page.getContext('2d');
      if(scale !== 1 && typeof context.setTransform === 'function') context.setTransform(scale, 0, 0, scale, 0, 0);
      drawEditionPage(context, data, layout, pageIndex, 0);
      pages.push(await canvasBlob(page, type, quality));
    }
    return {pages, width, height};
  }

  function crc32(bytes){
    let crc = 0xFFFFFFFF;
    for(const byte of bytes){
      crc ^= byte;
      for(let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function zipRecord(length, writer){
    const bytes = new Uint8Array(length);
    writer(new DataView(bytes.buffer));
    return bytes;
  }

  function buildZip(entries){
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    entries.forEach(entry => {
      const name = encoder.encode(entry.name);
      const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
      const checksum = crc32(data);
      const localHeader = zipRecord(30, view => {
        view.setUint32(0, 0x04034B50, true);
        view.setUint16(4, 20, true);
        view.setUint16(8, 0, true);
        view.setUint32(14, checksum, true);
        view.setUint32(18, data.length, true);
        view.setUint32(22, data.length, true);
        view.setUint16(26, name.length, true);
      });
      localParts.push(localHeader, name, data);

      const centralHeader = zipRecord(46, view => {
        view.setUint32(0, 0x02014B50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 20, true);
        view.setUint16(10, 0, true);
        view.setUint32(16, checksum, true);
        view.setUint32(20, data.length, true);
        view.setUint32(24, data.length, true);
        view.setUint16(28, name.length, true);
        view.setUint32(42, localOffset, true);
      });
      centralParts.push(centralHeader, name);
      localOffset += localHeader.length + name.length + data.length;
    });
    const central = concatBytes(centralParts);
    const end = zipRecord(22, view => {
      view.setUint32(0, 0x06054B50, true);
      view.setUint16(8, entries.length, true);
      view.setUint16(10, entries.length, true);
      view.setUint32(12, central.length, true);
      view.setUint32(16, localOffset, true);
    });
    return concatBytes([...localParts, central, end]);
  }

  async function createNewspaperPdf(data){
    const pageSet = await createEditionPageBlobs(data, 'image/jpeg', .9, 2);
    const jpegPages = await Promise.all(pageSet.pages.map(async blob => new Uint8Array(await blob.arrayBuffer())));
    return buildImagePdf(jpegPages, pageSet.width, pageSet.height);
  }

  async function savePageImages(data){
    const pageSet = await createEditionPageBlobs(data, 'image/png');
    const base = fileBase(data);
    const pageEntries = pageSet.pages.map((blob, index) => ({blob, name:`${base}-page-${String(index + 1).padStart(2, '0')}.png`}));
    const files = typeof File === 'function'
      ? pageEntries.map(entry => new File([entry.blob], entry.name, {type:'image/png'}))
      : [];
    if(files.length && navigator.share && (!navigator.canShare || navigator.canShare({files}))){
      await navigator.share({
        title:`1048 Gate Week ${data.week} - Full Edition`,
        text:'Save every page, then swipe through the weekly edition in Photos.',
        files
      });
      return 'shared';
    }
    const entries = await Promise.all(pageEntries.map(async entry => ({name:entry.name, data:new Uint8Array(await entry.blob.arrayBuffer())})));
    downloadBlob(new Blob([buildZip(entries)], {type:'application/zip'}), `${base}-page-images.zip`);
    return 'downloaded';
  }

  async function createShareImage(data){
    if(document.fonts?.ready) await document.fonts.ready;
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f3ead9';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#b98a52';
    context.lineWidth = 4;
    context.strokeRect(38, 38, 1004, 1274);
    context.strokeStyle = '#1b292b';
    context.lineWidth = 2;
    context.strokeRect(52, 52, 976, 1246);

    context.fillStyle = '#1b292b';
    context.font = '700 52px Oswald, Arial, sans-serif';
    context.fillText('1048 GATE WEEKLY', 78, 132);
    context.fillStyle = '#7b5b2f';
    context.font = '700 24px "Space Mono", monospace';
    context.textAlign = 'right';
    context.fillText(`SZN ${Number(data.season) - 2016}  /  WEEK ${data.week}  /  ${data.status === 'live' ? 'LIVE' : 'FINAL'}`, 1002, 126);
    context.textAlign = 'left';
    context.fillStyle = '#1b292b';
    context.fillRect(78, 166, 924, 5);

    let y = 244;
    context.font = '700 64px Oswald, Arial, sans-serif';
    const headline = canvasLines(context, data.headline || `Week ${data.week} Edition`, 910).slice(0, 3);
    headline.forEach(line => { context.fillText(line.toUpperCase(), 78, y); y += 72; });
    y += 18;
    context.font = '400 30px Georgia, serif';
    context.fillStyle = '#435153';
    canvasLines(context, data.standfirst || '', 900).slice(0, 3).forEach(line => { context.fillText(line, 78, y); y += 42; });

    y += 26;
    context.fillStyle = '#b98a52';
    context.fillRect(78, y, 924, 3);
    y += 48;

    const leader = data.tableNotes?.[0];
    const matchup = data.matchup || {};
    const facts = [
      {label:'TABLE LEADER', title:leader ? `${leader.team}  ${leader.record}` : 'Standings updated', detail:leader ? `${leader.owner} - ${leader.pointsFor} PF` : ''},
      {label:'MATCHUP OF THE WEEK', title:matchup.awayTeam ? `${matchup.awayTeam} / ${matchup.homeTeam}` : 'Week complete', detail:matchup.awayTeam ? `${matchup.awayScore ?? '-'} - ${matchup.homeScore ?? '-'}` : ''},
      {label:'THE WEEK IN VIEW', title:data.lead?.title || 'Verified league recap', detail:data.lead?.body || ''}
    ];
    facts.forEach((fact, index) => {
      const boxHeight = index === 2 ? 190 : 120;
      context.fillStyle = index % 2 ? '#e7dcc8' : '#ece1ce';
      context.fillRect(78, y, 924, boxHeight);
      context.fillStyle = '#7b5b2f';
      context.font = '700 20px "Space Mono", monospace';
      context.fillText(fact.label, 104, y + 31);
      context.fillStyle = '#1b292b';
      context.font = '700 30px Oswald, Arial, sans-serif';
      canvasLines(context, fact.title, 860).slice(0, 2).forEach((line, lineIndex) => context.fillText(line, 104, y + 65 + (lineIndex * 34)));
      if(fact.detail){
        context.fillStyle = '#4f5b5d';
        context.font = '400 20px Georgia, serif';
        canvasLines(context, fact.detail, 850).slice(0, index === 2 ? 3 : 1).forEach((line, lineIndex) => context.fillText(line, 104, y + 98 + (lineIndex * 27)));
      }
      y += boxHeight + 16;
    });

    context.fillStyle = '#1b292b';
    context.font = '700 22px "Space Mono", monospace';
    context.fillText('1048GATE.COM', 78, 1262);
    context.textAlign = 'right';
    context.fillStyle = '#596568';
    context.font = '700 18px "Space Mono", monospace';
    context.fillText('VERIFIED LEAGUE EDITION', 1002, 1262);
    context.textAlign = 'left';

    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed.')), 'image/png'));
  }

  async function downloadImage(data){
    return savePageImages(data);
  }

  async function shareImage(data){
    const blob = await createShareImage(data);
    const filename = `${fileBase(data)}-share.png`;
    const file = typeof File === 'function' ? new File([blob], filename, {type:'image/png'}) : null;
    if(file && navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))){
      await navigator.share({title:`1048 Gate Week ${data.week}`, text:data.headline || '1048 Gate Weekly Edition', files:[file]});
      return 'shared';
    }
    downloadBlob(blob, filename);
    return 'downloaded';
  }

  window.gateNewspaperExport = Object.freeze({
    fileBase,
    editionSections,
    buildWeeklyPdf,
    buildImagePdf,
    buildZip,
    createFullEditionCanvas,
    createEditionPageBlobs,
    createNewspaperPdf,
    createShareImage,
    downloadPdf,
    downloadImage,
    savePageImages,
    shareImage
  });
})();

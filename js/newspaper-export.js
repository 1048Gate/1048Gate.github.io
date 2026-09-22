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
      const score = `${matchup.awayTeam} ${matchup.awayScore ?? '-'} - ${matchup.homeScore ?? '-'} ${matchup.homeTeam}`;
      add({label:'Matchup of the week', title:score, body:[matchup.whyItMatters, matchup.edge].filter(Boolean).join(' ')});
    }
    const table = Array.isArray(data.tableNotes) ? data.tableNotes : [];
    if(table.length){
      add({
        label:'The five-minute table',
        title:'Standings snapshot',
        body:table.map(note => `${note.rank}. ${note.team} (${note.owner}) - ${note.record}, ${note.pointsFor} PF - ${note.tag || ''}`).join('\n')
      });
    }
    const editorialNotes = [
      [data.pressure, data.pressure?.label || 'Next test'],
      [data.surprise, 'Biggest surprise'],
      [data.recordWatch, 'Record to watch'],
      [data.archiveComparison, 'From the archive']
    ];
    for(const [item, label] of editorialNotes){
      if(item?.body) add({label, title:item.title || item.team || 'League note', body:item.body});
    }
    const coveredTypes = new Set(['closest_game','scoring_leaders','standings','record_watch']);
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

  async function createFullEditionCanvas(data){
    if(document.fonts?.ready) await document.fonts.ready;
    const PAGE_WIDTH = 1080;
    const PAGE_HEIGHT = 1398;
    const LEFT = 78;
    const CONTENT_WIDTH = 924;
    const BOTTOM = 1276;
    const measureCanvas = document.createElement('canvas');
    const measure = measureCanvas.getContext('2d');

    measure.font = '700 58px Oswald, Arial, sans-serif';
    const headlineLines = canvasParagraphLines(measure, data.headline || `Week ${data.week} Edition`, CONTENT_WIDTH).slice(0, 4);
    measure.font = '400 26px Georgia, serif';
    const standfirstLines = canvasParagraphLines(measure, data.standfirst || '', CONTENT_WIDTH).slice(0, 5);
    const firstContentTop = 205 + (headlineLines.length * 66) + (standfirstLines.length * 38) + 58;

    const blocks = editionSections(data).map(section => {
      measure.font = '700 34px Oswald, Arial, sans-serif';
      const titleLines = canvasParagraphLines(measure, section.title || '', CONTENT_WIDTH);
      measure.font = '400 23px Georgia, serif';
      const bodyLines = canvasParagraphLines(measure, section.body || '', CONTENT_WIDTH);
      return {...section, titleLines, bodyLines, height:40 + (titleLines.length * 41) + 12 + (bodyLines.length * 33) + 34};
    });

    const placed = [];
    let page = 0;
    let y = firstContentTop;
    blocks.forEach(block => {
      if(y + block.height > BOTTOM){ page += 1; y = 142; }
      placed.push({...block, page, y});
      y += block.height;
    });
    const pageCount = page + 1;
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_WIDTH;
    canvas.height = PAGE_HEIGHT * pageCount;
    const context = canvas.getContext('2d');

    for(let pageIndex = 0; pageIndex < pageCount; pageIndex++){
      const offset = pageIndex * PAGE_HEIGHT;
      context.fillStyle = '#f3ead9';
      context.fillRect(0, offset, PAGE_WIDTH, PAGE_HEIGHT);
      context.strokeStyle = '#b98a52';
      context.lineWidth = 4;
      context.strokeRect(38, offset + 38, 1004, 1322);
      context.strokeStyle = '#1b292b';
      context.lineWidth = 2;
      context.strokeRect(52, offset + 52, 976, 1294);

      context.fillStyle = '#1b292b';
      context.font = '700 45px Oswald, Arial, sans-serif';
      context.fillText(pageIndex ? '1048 GATE WEEKLY · CONTINUED' : '1048 GATE WEEKLY', LEFT, offset + 112);
      context.textAlign = 'right';
      context.fillStyle = '#7b5b2f';
      context.font = '700 20px "Space Mono", monospace';
      context.fillText(`WEEK ${data.week}  /  ${data.status === 'live' ? 'LIVE' : 'FINAL'}`, 1002, offset + 108);
      context.textAlign = 'left';
      context.fillStyle = '#1b292b';
      context.fillRect(LEFT, offset + 132, CONTENT_WIDTH, 4);

      context.fillStyle = '#596568';
      context.font = '700 17px "Space Mono", monospace';
      context.fillText('1048GATE.COM  ·  VERIFIED LEAGUE EDITION', LEFT, offset + 1325);
      context.textAlign = 'right';
      context.fillText(`PAGE ${pageIndex + 1} OF ${pageCount}`, 1002, offset + 1325);
      context.textAlign = 'left';
    }

    context.fillStyle = '#1b292b';
    context.font = '700 58px Oswald, Arial, sans-serif';
    let headerY = 205;
    headlineLines.forEach(line => { context.fillText(line.toUpperCase(), LEFT, headerY); headerY += 66; });
    headerY += 8;
    context.fillStyle = '#435153';
    context.font = '400 26px Georgia, serif';
    standfirstLines.forEach(line => { context.fillText(line, LEFT, headerY); headerY += 38; });
    context.fillStyle = '#7b5b2f';
    context.fillRect(LEFT, headerY + 10, CONTENT_WIDTH, 3);

    placed.forEach(block => {
      let blockY = (block.page * PAGE_HEIGHT) + block.y;
      context.strokeStyle = 'rgba(39,50,52,.34)';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(LEFT, blockY);
      context.lineTo(LEFT + CONTENT_WIDTH, blockY);
      context.stroke();
      blockY += 29;
      context.fillStyle = '#7b5b2f';
      context.font = '700 18px "Space Mono", monospace';
      context.fillText(String(block.label || 'League story').toUpperCase(), LEFT, blockY);
      blockY += 42;
      context.fillStyle = '#172022';
      context.font = '700 34px Oswald, Arial, sans-serif';
      block.titleLines.forEach(line => { context.fillText(line.toUpperCase(), LEFT, blockY); blockY += 41; });
      blockY += 7;
      context.fillStyle = '#273234';
      context.font = '400 23px Georgia, serif';
      block.bodyLines.forEach(line => { context.fillText(line, LEFT, blockY); blockY += 33; });
    });
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
      const content = `q\n612 0 0 792 0 0 cm\n/${imageName} Do\nQ`;
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

  async function createEditionPageBlobs(data, type='image/png', quality){
    const full = await createFullEditionCanvas(data);
    const pageHeight = 1398;
    const pages = [];
    for(let top = 0; top < full.height; top += pageHeight){
      const page = document.createElement('canvas');
      page.width = full.width;
      page.height = pageHeight;
      const context = page.getContext('2d');
      context.fillStyle = '#f3ead9';
      context.fillRect(0, 0, page.width, page.height);
      context.drawImage(full, 0, top, full.width, pageHeight, 0, 0, full.width, pageHeight);
      pages.push(await canvasBlob(page, type, quality));
    }
    return {pages, width:full.width, height:pageHeight};
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
    const pageSet = await createEditionPageBlobs(data, 'image/jpeg', .94);
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

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
    const lead = data.lead || {};
    const matchup = data.matchup || {};
    if(lead.body) sections.push({label:'Lead story', title:lead.title || 'The week in view', body:lead.body});
    if(matchup.awayTeam){
      const score = `${matchup.awayTeam} ${matchup.awayScore ?? '-'} - ${matchup.homeScore ?? '-'} ${matchup.homeTeam}`;
      sections.push({label:'Matchup of the week', title:score, body:[matchup.whyItMatters, matchup.edge].filter(Boolean).join(' ')});
    }
    const table = Array.isArray(data.tableNotes) ? data.tableNotes : [];
    if(table.length){
      sections.push({
        label:'The five-minute table',
        title:'Standings snapshot',
        body:table.map(note => `${note.rank}. ${note.team} (${note.owner}) - ${note.record}, ${note.pointsFor} PF - ${note.tag || ''}`).join('\n')
      });
    }
    for(const item of [data.pressure, data.surprise, data.recordWatch, data.archiveComparison]){
      if(item?.body) sections.push({label:item.label || 'Around the league', title:item.title || item.team || 'League note', body:item.body});
    }
    (Array.isArray(data.stories) ? data.stories : []).forEach(story => sections.push({
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

  function downloadPdf(data){
    downloadBlob(new Blob([buildWeeklyPdf(data)], {type:'application/pdf'}), `${fileBase(data)}-edition.pdf`);
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
    const blob = await createShareImage(data);
    downloadBlob(blob, `${fileBase(data)}-share.png`);
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

  window.gateNewspaperExport = Object.freeze({fileBase, editionSections, buildWeeklyPdf, createShareImage, downloadPdf, downloadImage, shareImage});
})();

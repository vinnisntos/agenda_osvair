(function () {
  const el = (id) => document.getElementById(id);
  const form = el('recibo-form');

  const FIELDS = [
    ['prestador', 'Prestador / Service provider'],
    ['cpf', 'CPF / Brazilian Tax ID'],
    ['passageiro', 'Passageiro / Passenger'],
    ['documento', 'Passaporte ou documento / ID'],
    ['origem', 'Origem / Pick up location'],
    ['destino', 'Destino / Destination'],
    ['data_servico', 'Data do serviço / Service date'],
    ['forma_pagamento', 'Forma de pagamento / Payment method'],
    ['local_data', 'Local e data / Place and date']
  ];

  function showReceipts() {
    el('view-dashboard').classList.add('hidden');
    el('view-financeiro').classList.add('hidden');
    el('view-recibos').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    updatePreview();
  }

  el('btn-ir-recibos').addEventListener('click', showReceipts);
  el('btn-fin-ir-recibos').addEventListener('click', showReceipts);

  el('btn-rec-ir-agendamentos').addEventListener('click', () => {
    el('view-recibos').classList.add('hidden');
    el('view-dashboard').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  el('btn-rec-ir-financeiro').addEventListener('click', () => {
    el('view-recibos').classList.add('hidden');
    el('btn-ir-financeiro').click();
  });

  el('btn-logout-recibos').addEventListener('click', async () => {
    await window.sb.auth.signOut();
    el('view-recibos').classList.add('hidden');
    el('view-login').classList.remove('hidden');
  });

  function readForm() {
    const fd = new FormData(form);
    return Object.fromEntries([...fd.entries()].map(([key, value]) => [key, String(value).trim()]));
  }

  function formatDate(iso) {
    if (!iso) return '';
    const parts = iso.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
  }

  function formatAmount(raw) {
    if (raw === '') return '';
    const value = Number(raw);
    if (!Number.isFinite(value)) return '';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }

  function previewValue(key, value) {
    return key === 'data_servico' ? formatDate(value) : value;
  }

  function updatePreview() {
    const data = readForm();
    el('recibo-preview-valor').textContent = formatAmount(data.valor) || 'Valor não informado';
    const container = el('recibo-preview-dados');
    container.innerHTML = '';

    const populated = FIELDS.filter(([key]) => data[key]);
    if (!populated.length) {
      const empty = document.createElement('p');
      empty.className = 'text-xs text-gray-400 sm:col-span-2';
      empty.textContent = 'Os dados preenchidos aparecerão aqui e no PDF.';
      container.appendChild(empty);
      return;
    }

    populated.forEach(([key, label]) => {
      const item = document.createElement('div');
      item.className = 'recibo-preview-item';
      const labelEl = document.createElement('p');
      labelEl.className = 'recibo-preview-label';
      labelEl.textContent = label;
      const valueEl = document.createElement('p');
      valueEl.className = 'recibo-preview-value';
      valueEl.textContent = previewValue(key, data[key]);
      item.append(labelEl, valueEl);
      container.appendChild(item);
    });
  }

  form.addEventListener('input', updatePreview);
  form.addEventListener('change', updatePreview);
  el('btn-limpar-recibo').addEventListener('click', () => {
    form.reset();
    el('recibo-error').classList.add('hidden');
    updatePreview();
  });

  function addWrappedText(doc, text, x, y, width, options) {
    const lines = doc.splitTextToSize(text, width);
    doc.text(lines, x, y, options);
    return y + (lines.length * 5);
  }

  function addDetail(doc, label, value, x, y, width) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(125, 125, 125);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(35, 35, 35);
    const lines = doc.splitTextToSize(value, width);
    doc.text(lines, x, y + 5);
    return y + 7 + (lines.length * 4.5);
  }

  function drawContinuationHeader(doc, margin) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(35, 35, 35);
    doc.text('RECIBO / RECEIPT', margin, 18);
    doc.setDrawColor(225, 225, 225);
    doc.line(margin, 22, doc.internal.pageSize.getWidth() - margin, 22);
  }

  function drawPageFooters(doc, margin) {
    const pageCount = doc.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(230, 230, 230);
      doc.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(140, 140, 140);
      doc.text('Documento bilíngue emitido em português e inglês.', margin, pageHeight - 13);
      doc.text(`Bilingual document issued in Portuguese and English.  ${page}/${pageCount}`, pageWidth - margin, pageHeight - 13, { align: 'right' });
    }
  }

  function drawPdf(data) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('A biblioteca de geração de PDF não foi carregada. Atualize a página e tente novamente.');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 18;
    const contentWidth = pageWidth - (margin * 2);

    doc.setFillColor(17, 17, 17);
    doc.rect(0, 0, pageWidth, 39, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('RECIBO / RECEIPT', margin, 21);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(190, 190, 190);
    doc.text('TRANSPORTE EXECUTIVO / EXECUTIVE TRANSPORTATION', margin, 29);

    const amount = formatAmount(data.valor);
    if (amount) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text(amount, pageWidth - margin, 22, { align: 'right' });
    }

    let y = 52;
    doc.setTextColor(45, 45, 45);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    y = addWrappedText(doc,
      'Declaro, para os devidos fins, o recebimento do valor indicado neste documento pelos serviços de transporte aqui descritos.',
      margin, y, contentWidth);
    doc.setTextColor(95, 95, 95);
    y = addWrappedText(doc,
      'I hereby acknowledge receipt of the amount stated in this document for the transportation services described herein.',
      margin, y + 2, contentWidth);

    y += 8;
    doc.setDrawColor(225, 225, 225);
    doc.line(margin, y, pageWidth - margin, y);
    y += 9;

    const details = FIELDS
      .filter(([key]) => data[key])
      .map(([key, label]) => [label, previewValue(key, data[key])]);

    if (details.length) {
      const gap = 9;
      const columnWidth = (contentWidth - gap) / 2;
      for (let i = 0; i < details.length; i += 2) {
        const left = details[i];
        const right = details[i + 1];
        const leftLines = doc.splitTextToSize(left[1], columnWidth).length;
        const rightLines = right ? doc.splitTextToSize(right[1], columnWidth).length : 0;
        const rowHeight = 12 + (Math.max(leftLines, rightLines) * 4.5);
        if (y + rowHeight > pageHeight - 28) {
          doc.addPage();
          drawContinuationHeader(doc, margin);
          y = 32;
        }
        const leftEnd = addDetail(doc, left[0], left[1], margin, y, columnWidth);
        const rightEnd = right
          ? addDetail(doc, right[0], right[1], margin + columnWidth + gap, y, columnWidth)
          : y;
        y = Math.max(leftEnd, rightEnd) + 5;
      }
    } else {
      doc.setFontSize(9);
      doc.setTextColor(130, 130, 130);
      doc.text('Dados não informados / Details not provided', margin, y);
      y += 13;
    }

    if (y + 42 > pageHeight - 25) {
      doc.addPage();
      drawContinuationHeader(doc, margin);
      y = 42;
    }
    const signatureY = Math.max(y + 22, 205);
    doc.setDrawColor(80, 80, 80);
    doc.line(55, signatureY, pageWidth - 55, signatureY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Assinatura do prestador / Service provider signature', pageWidth / 2, signatureY + 5, { align: 'center' });
    if (data.prestador) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(45, 45, 45);
      doc.text(doc.splitTextToSize(data.prestador, 90), pageWidth / 2, signatureY + 11, { align: 'center' });
    }

    drawPageFooters(doc, margin);

    const passengerSlug = (data.passageiro || 'recibo')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
    const dateSlug = data.data_servico || new Date().toISOString().slice(0, 10);
    doc.save(`recibo_${passengerSlug || 'recibo'}_${dateSlug}.pdf`);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const errorEl = el('recibo-error');
    errorEl.classList.add('hidden');
    const button = el('btn-gerar-recibo');
    button.disabled = true;
    button.textContent = 'Gerando PDF...';
    try {
      drawPdf(readForm());
    } catch (error) {
      console.error(error);
      errorEl.textContent = error.message || 'Não foi possível gerar o recibo. Tente novamente.';
      errorEl.classList.remove('hidden');
    } finally {
      button.disabled = false;
      button.textContent = 'Gerar recibo em PDF';
    }
  });

  updatePreview();
})();

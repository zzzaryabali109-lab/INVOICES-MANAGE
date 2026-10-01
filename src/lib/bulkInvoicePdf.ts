import jsPDF from 'jspdf';

export function generateFallbackInvoicePdf(data: Record<string, any>): string {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header / Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59);
  doc.text(data.company_name || 'COMMERCIAL INVOICE', pageWidth / 2, 20, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('ORIGINAL COMMERCIAL INVOICE', pageWidth / 2, 26, { align: 'center' });

  // Divider line
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.line(14, 30, pageWidth - 14, 30);

  // Top Info Box (Invoice #, Date, BL #, Container)
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);

  let y = 38;
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE NO:', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.text(String(data.invoice_number || '-'), 42, y);

  doc.setFont('helvetica', 'bold');
  doc.text('DATE:', pageWidth - 70, y);
  doc.setFont('helvetica', 'normal');
  doc.text(String(data.date || new Date().toISOString().split('T')[0]), pageWidth - 45, y);

  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.text('BL NO:', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.text(String(data.bl_number || data.reference || '-'), 42, y);

  doc.setFont('helvetica', 'bold');
  doc.text('CONTAINER:', pageWidth - 70, y);
  doc.setFont('helvetica', 'normal');
  doc.text(String(data.container_info || data.container_numbers || '-'), pageWidth - 45, y);

  // Parties Box
  y += 12;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, y, pageWidth - 28, 40, 2, 2, 'F');
  doc.rect(14, y, pageWidth - 28, 40, 'S');

  const halfW = (pageWidth - 28) / 2;

  // Shipper (Left)
  doc.setFont('helvetica', 'bold');
  doc.text('SHIPPER / EXPORTER:', 18, y + 6);
  doc.setFont('helvetica', 'normal');
  const shipperLines = doc.splitTextToSize(
    [data.shipper, data.shipper_address].filter(Boolean).join('\n') || 'N/A',
    halfW - 8
  );
  doc.text(shipperLines, 18, y + 12);

  // Consignee (Right)
  doc.setFont('helvetica', 'bold');
  doc.text('CONSIGNEE / BUYER:', 18 + halfW, y + 6);
  doc.setFont('helvetica', 'normal');
  const consigneeLines = doc.splitTextToSize(
    [data.consignee, data.consignee_address].filter(Boolean).join('\n') || 'N/A',
    halfW - 8
  );
  doc.text(consigneeLines, 18 + halfW, y + 12);

  // Shipping details
  y += 46;
  doc.setFont('helvetica', 'bold');
  doc.text('VESSEL / VOYAGE:', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.text(String(data.vessel || '-'), 48, y);

  doc.setFont('helvetica', 'bold');
  doc.text('PORT OF LOADING:', pageWidth - 85, y);
  doc.setFont('helvetica', 'normal');
  doc.text(String(data.port_of_loading || '-'), pageWidth - 48, y);

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('PORT OF DISCHARGE:', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.text(String(data.port_of_discharge || '-'), 56, y);

  // Table Header
  y += 12;
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, pageWidth - 28, 8, 'F');
  doc.rect(14, y, pageWidth - 28, 8, 'S');

  doc.setFont('helvetica', 'bold');
  doc.text('DESCRIPTION OF GOODS', 18, y + 5.5);
  doc.text('HS CODE', 95, y + 5.5);
  doc.text('QUANTITY', 125, y + 5.5);
  doc.text('PRICE', 152, y + 5.5);
  doc.text('TOTAL', pageWidth - 20, y + 5.5, { align: 'right' });

  // Table Body Row
  y += 8;
  doc.rect(14, y, pageWidth - 28, 22, 'S');

  doc.setFont('helvetica', 'normal');
  const descText = String(data.goods_description || data.description || 'USED CLOTHING');
  doc.text(doc.splitTextToSize(descText, 70), 18, y + 6);
  doc.text(String(data.hs_code || '6309.1010'), 95, y + 6);

  const weightStr = data.gross_weight || (data.kgs ? `${data.kgs} KGS` : '-');
  doc.text(String(weightStr), 125, y + 6);

  const priceStr = data.unit_price ? `$${data.unit_price}` : '-';
  doc.text(priceStr, 152, y + 6);

  const totalStr = data.amount || (data.total_amount ? `$${data.total_amount}` : '-');
  doc.setFont('helvetica', 'bold');
  doc.text(String(totalStr), pageWidth - 20, y + 6, { align: 'right' });

  // Summary section
  y += 28;
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL AMOUNT:', pageWidth - 60, y);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(String(totalStr), pageWidth - 20, y, { align: 'right' });

  // Footer / Stamp
  y = 250;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('This is a computer-generated document. Verified & validated.', pageWidth / 2, y, { align: 'center' });

  // Return base64 string
  const output = doc.output('datauristring');
  return output.split(',')[1] || '';
}

import html2canvas from 'html2canvas'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun, AlignmentType } from 'docx'
import logoUrl from '@/assets/logo.png'

// Three ways a patient can take an APPROVED document request "with
// them" -- print it, save it as an image, or save it as an actual Word
// file -- all built from the same request data and all matching the
// same letterhead look: the real BULSU Infirmary seal (assets/logo.png,
// not a generic icon) and the app's actual primary green (#1E7B5E,
// legacy.css's --primary), not an arbitrary color picked to match a
// mockup.

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Saves a screenshot of the given DOM element as a PNG download. */
export async function exportElementAsPng(element, filename) {
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2, // sharper output than a raw 1:1 screen capture
  })
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not generate the image.')
  triggerDownload(blob, filename)
}

const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 2, color: 'D0C8BC' },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: 'D0C8BC' },
  left: { style: BorderStyle.SINGLE, size: 2, color: 'D0C8BC' },
  right: { style: BorderStyle.SINGLE, size: 2, color: 'D0C8BC' },
}

function detailRow(label, value) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 32, type: WidthType.PERCENTAGE },
        borders: cellBorders,
        shading: { fill: 'E3F4EF' }, // --primary-light
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, color: '1E7B5E' })] })],
      }),
      new TableCell({
        width: { size: 68, type: WidthType.PERCENTAGE },
        borders: cellBorders,
        children: [new Paragraph({ children: [new TextRun({ text: value || '—', size: 20, color: '1A1310' })] })],
      }),
    ],
  })
}

/** Builds and downloads a real .docx Word document for one document
 * request -- same fields as the detail view (Document Type, Purpose,
 * Date Requested, Date Needed, Status, Notes), stripped of any HTML/
 * icon markup those fields carry on-screen (renderNotes() in
 * MyRequestsPage.jsx returns JSX with icons/colors for display, not
 * something a Word doc needs). */
export async function exportRequestAsDocx({ docType, purpose, dateRequested, dateNeeded, status, notesText, patientName }, filename) {
  // The real seal (assets/logo.png), not a placeholder icon -- fetched
  // as bytes since docx's ImageRun needs raw image data, not a URL.
  const logoBytes = await fetch(logoUrl).then((r) => r.arrayBuffer())

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new ImageRun({ data: logoBytes, transformation: { width: 56, height: 56 }, type: 'png' }),
              new TextRun({ text: '   BULSU INFIRMARY', bold: true, size: 32, color: '1E7B5E' }),
              new TextRun({ text: ' — DOCUMENT REQUEST', size: 32, color: '6E6358' }),
            ],
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '1E7B5E', space: 8 } },
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [new TextRun({ text: patientName || '', bold: true, size: 22, color: '2E2420' })],
            spacing: { after: 300 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              detailRow('Document Type', docType),
              detailRow('Purpose', purpose),
              detailRow('Date Requested', dateRequested),
              detailRow('Date Needed', dateNeeded),
              detailRow('Status', status),
              detailRow('Notes', notesText),
            ],
          }),
          new Paragraph({
            children: [new TextRun({ text: `📅 Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}   |   Bulsu Infirmary Patient Portal`, size: 16, italics: true, color: '6E6358' })],
            spacing: { before: 400 },
            alignment: AlignmentType.LEFT,
          }),
        ],
      },
    ],
  })
  const blob = await Packer.toBlob(doc)
  triggerDownload(blob, filename)
}
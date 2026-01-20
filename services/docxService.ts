
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } from "docx";
import { PageResult, OCRBlock } from '../types';

export async function generateDocx(pages: PageResult[], exportAll: boolean = false) {
    const sections = pages.map(p => {
        const blocksToExport = exportAll ? p.blocks : p.blocks.filter(b => b.isSelected);
        if (blocksToExport.length === 0) return null;

        const children = blocksToExport.map(block => {
            if (block.type === 'table' as any && block.tableData) {
                const maxRow = Math.max(...block.tableData.map(d => d.row));
                const maxCol = Math.max(...block.tableData.map(d => d.col));
                
                const rows = [];
                for (let r = 0; r <= maxRow; r++) {
                    const cells = [];
                    for (let c = 0; c <= maxCol; c++) {
                        const cellData = block.tableData.find(td => td.row === r && td.col === c);
                        cells.push(new TableCell({
                            children: [new Paragraph({
                                children: [new TextRun({ text: cellData?.text || "", font: "Baloo 2" })],
                            })],
                            width: { size: 100 / (maxCol + 1), type: WidthType.PERCENTAGE },
                        }));
                    }
                    rows.push(new TableRow({ children: cells }));
                }

                return new Table({
                    rows: rows,
                    width: { size: 100, type: WidthType.PERCENTAGE },
                });
            } else {
                return new Paragraph({
                    children: [new TextRun({ text: block.text, font: "Baloo 2", size: 24 })],
                    spacing: { after: 200 },
                });
            }
        });

        return {
            properties: {},
            children: children,
        };
    }).filter(s => s !== null);

    if (sections.length === 0) return;

    const doc = new Document({
        sections: sections as any,
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "OmniLex_Digitized_Export.docx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

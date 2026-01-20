
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } from "docx";
import { PageResult, OCRBlock } from '../types';

export async function generateDocx(pages: PageResult[], exportAll: boolean = false) {
    try {
        const sections = pages.map(p => {
            const blocksToExport = exportAll ? p.blocks : p.blocks.filter(b => b.isSelected);
            if (blocksToExport.length === 0) return null;

            const children: (Paragraph | Table)[] = [];

            blocksToExport.forEach(block => {
                if (block.type === 'table' as any && block.tableData && block.tableData.length > 0) {
                    const maxRow = Math.max(...block.tableData.map(d => d.row));
                    const maxCol = Math.max(...block.tableData.map(d => d.col));
                    
                    const rows: TableRow[] = [];
                    for (let r = 0; r <= maxRow; r++) {
                        const cells: TableCell[] = [];
                        for (let c = 0; c <= maxCol; c++) {
                            const cellData = block.tableData.find(td => td.row === r && td.col === c);
                            cells.push(new TableCell({
                                children: [
                                    new Paragraph({
                                        children: [
                                            new TextRun({ 
                                                text: cellData?.text || "", 
                                                font: "Nirmala UI", // Standard Windows font for Devanagari
                                                size: 22 
                                            })
                                        ],
                                        alignment: AlignmentType.LEFT,
                                    })
                                ],
                                width: { size: 100 / (maxCol + 1), type: WidthType.PERCENTAGE },
                            }));
                        }
                        rows.push(new TableRow({ children: cells }));
                    }

                    children.push(new Table({
                        rows: rows,
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        borders: {
                            top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                            bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                            left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                            right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                        }
                    }));
                    // Add spacing after table
                    children.push(new Paragraph({ children: [] }));
                } else {
                    children.push(new Paragraph({
                        children: [
                            new TextRun({ 
                                text: block.text, 
                                font: "Nirmala UI", 
                                size: 24 
                            })
                        ],
                        spacing: { after: 200 },
                    }));
                }
            });

            return {
                properties: {
                    page: {
                        margin: {
                            top: 720,
                            right: 720,
                            bottom: 720,
                            left: 720,
                        },
                    },
                },
                children: children,
            };
        }).filter((s): s is NonNullable<typeof s> => s !== null);

        if (sections.length === 0) return;

        const doc = new Document({
            sections: sections,
            title: "OmniLex Digitized Document",
            creator: "OmniLex OCR",
            description: "OCR Export from OmniLex",
        });

        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "OmniLex_Digitized_Export.docx";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // Revoke the object URL after a delay
        setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
        console.error("Error generating DOCX:", error);
    }
}

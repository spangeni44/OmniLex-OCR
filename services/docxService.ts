
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } from "docx";
import { PageResult, OCRBlock } from '../types';

/**
 * Generates a professional DOCX file from processed OCR results.
 * Optimized for layout preservation and multilingual script support.
 */
export async function generateDocx(pages: PageResult[], exportAll: boolean = false) {
    try {
        const sections = pages.map(p => {
            const blocksToExport = exportAll ? p.blocks : p.blocks.filter(b => b.isSelected);
            if (blocksToExport.length === 0) return null;

            const children: (Paragraph | Table)[] = [];

            blocksToExport.forEach(block => {
                // Handle Table Blocks
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
                                                font: "Nirmala UI", 
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
                    // Space after table
                    children.push(new Paragraph({ spacing: { before: 200, after: 200 } }));
                } 
                // Handle Text Blocks (Paragraphs, Headers, etc.)
                else {
                    // Split block text by lines to ensure line breaks are preserved
                    const lines = block.text.split('\n');
                    
                    lines.forEach((line, index) => {
                        // Preserving spaces and tabs within the line
                        // docx library handles text runs; we use leading spaces preservation
                        const formattedLine = line.replace(/\t/g, '    '); // Replace tabs with 4 spaces for better compatibility
                        
                        children.push(new Paragraph({
                            children: [
                                new TextRun({ 
                                    text: formattedLine, 
                                    font: "Nirmala UI", 
                                    size: block.type === 'header' as any ? 28 : 24,
                                    bold: block.type === 'header' as any || block.isBold
                                })
                            ],
                            // Add significant spacing after the last line of a block to separate from the next block
                            spacing: { 
                                after: (index === lines.length - 1) ? 240 : 80,
                                line: 360 // Line height
                            },
                        }));
                    });
                }
            });

            return {
                properties: {
                    page: {
                        margin: {
                            top: 1440, // 1 inch
                            right: 1440,
                            bottom: 1440,
                            left: 1440,
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
            description: "Digitized document export powered by OmniLex OCR Engine.",
            styles: {
                default: {
                    document: {
                        run: {
                            font: "Nirmala UI",
                            size: 24,
                        },
                        paragraph: {
                            spacing: { line: 240 },
                        }
                    }
                }
            }
        });

        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `OmniLex_Export_${new Date().getTime()}.docx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Cleanup memory
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
        console.error("OmniLex DOCX Engine Error:", error);
        alert("Failed to generate DOCX file. Please try again or check your browser console.");
    }
}

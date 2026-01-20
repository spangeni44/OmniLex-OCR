
import React, { useCallback } from 'react';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  isLoading: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFilesSelected, isLoading }) => {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (isLoading) return;
    const files = Array.from(e.dataTransfer.files);
    onFilesSelected(files);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLoading) return;
    const files = e.target.files ? Array.from(e.target.files) : [];
    onFilesSelected(files);
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`relative w-full h-64 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer
        ${isLoading ? 'bg-gray-100 border-gray-300' : 'bg-white border-blue-400 hover:bg-blue-50'}`}
    >
      <input 
        type="file" 
        multiple 
        accept="image/*,application/pdf"
        className="absolute inset-0 opacity-0 cursor-pointer"
        onChange={handleInputChange}
        disabled={isLoading}
      />
      
      <div className="flex flex-col items-center pointer-events-none">
        <svg className="w-12 h-12 text-blue-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <h3 className="text-xl font-semibold text-gray-800">Drop PDF or Images here</h3>
        <p className="text-gray-500 mt-2">Support for Nepali (Devanagari), English, and Hindi</p>
        <span className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm font-medium">Browse Files</span>
      </div>
    </div>
  );
};

export default FileUpload;

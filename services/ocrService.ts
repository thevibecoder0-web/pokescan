
import { createWorker } from 'tesseract.js';

// Fix: Change Tesseract.Worker to any to resolve the "Cannot find namespace 'Tesseract'" error.
let worker: any = null;

export const initOCR = async () => {
  if (!worker) {
    worker = await createWorker('eng');
  }
  return worker;
};

export const extractNameLocally = async (imageBlob: Blob | string): Promise<string | null> => {
  try {
    const w = await initOCR();
    const { data: { text } } = await w.recognize(imageBlob);
    
    // Pokemon names are usually single words at the top. 
    // We clean the OCR noise (Tesseract can be messy with logos).
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    
    // Typically the first or second line is the name.
    if (lines.length > 0) {
      // Remove common OCR mistakes for TCG cards
      const cleanedName = lines[0].replace(/[^a-zA-Z\s-]/g, '').trim();
      return cleanedName.length > 2 ? cleanedName : null;
    }
    return null;
  } catch (error) {
    console.error("Local OCR Error:", error);
    return null;
  }
};

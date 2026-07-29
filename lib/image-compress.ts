// Client-seitige Bildkompression vor dem Mail-Versand (Attachments klein halten).
const MAX_IMAGE_DIMENSION = 1920;
const IMAGE_QUALITY = 0.8;

export async function compressImageSource(src: string): Promise<{ base64: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas nicht verfügbar'));
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
      const base64 = dataUrl.split(',')[1];
      resolve({ base64, contentType: 'image/jpeg' });
    };
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
    img.src = src;
  });
}

export async function compressImageFile(file: File): Promise<{ base64: string; contentType: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await compressImageSource(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

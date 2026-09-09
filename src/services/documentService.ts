import { supabase } from '@/integrations/supabase/client';

export type DocumentType = 'bl' | 'invoice';

function getFilePath(userId: string, containerNumber: string, docType: DocumentType, fileName: string) {
  return `${userId}/${containerNumber}/${docType}/${fileName}`;
}

function getFolderPath(userId: string, containerNumber: string, docType: DocumentType) {
  return `${userId}/${containerNumber}/${docType}`;
}

export async function uploadDocument(
  containerNumber: string,
  docType: DocumentType,
  file: File
): Promise<{ success: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const filePath = getFilePath(user.id, containerNumber, docType, file.name);

  const { error } = await supabase.storage
    .from('container-documents')
    .upload(filePath, file, { upsert: true });

  if (error) {
    console.error('Upload error:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function getDocumentUrl(
  containerNumber: string,
  docType: DocumentType
): Promise<{ url: string | null; fileName: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { url: null, fileName: null };

  const folderPath = getFolderPath(user.id, containerNumber, docType);

  const { data: files, error } = await supabase.storage
    .from('container-documents')
    .list(folderPath, { limit: 1, sortBy: { column: 'created_at', order: 'desc' } });

  if (error || !files || files.length === 0) {
    return { url: null, fileName: null };
  }

  const fileName = files[0].name;
  const fullPath = `${folderPath}/${fileName}`;

  const { data } = await supabase.storage
    .from('container-documents')
    .createSignedUrl(fullPath, 3600);

  return { url: data?.signedUrl || null, fileName };
}

export async function checkDocumentExists(
  userId: string,
  containerNumber: string,
  docType: DocumentType
): Promise<boolean> {
  const folderPath = getFolderPath(userId, containerNumber, docType);

  const { data: files } = await supabase.storage
    .from('container-documents')
    .list(folderPath, { limit: 1 });

  return !!(files && files.length > 0);
}

export async function getDocumentsStatus(
  userId: string,
  containerNumbers: string[]
): Promise<Record<string, { bl: boolean; invoice: boolean }>> {
  const result: Record<string, { bl: boolean; invoice: boolean }> = {};

  // Check all containers in parallel
  await Promise.all(
    containerNumbers.map(async (cn) => {
      const [blExists, invoiceExists] = await Promise.all([
        checkDocumentExists(userId, cn, 'bl'),
        checkDocumentExists(userId, cn, 'invoice'),
      ]);
      result[cn] = { bl: blExists, invoice: invoiceExists };
    })
  );

  return result;
}

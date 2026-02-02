import prisma from '../lib/prisma.js';

// 🔐 HELPER: Kim tarafından yapılan istek kontrol et
const getStaffInfo = async (userId, accountId, role) => {
  // ✅ GÜVENLİK: Parametreleri kontrol et
  if (!userId || !accountId || !role) {
    throw new Error('Geçersiz kullanıcı bilgileri');
  }

  // ✅ GÜVENLİK: Staff kaydı kontrol et - SADECE kendi accountId'sine ait staff'ı bul
  const staff = await prisma.staff.findFirst({
    where: {
      userId: parseInt(userId),
      accountId: parseInt(accountId)
    }
  });

  // Staff kaydı yoksa hata ver
  if (!staff) {
    if (role === 'OWNER' || role === 'ADMIN') {
      throw new Error('Staff kaydınız bulunamadı. Lütfen önce Personeller bölümünden kendiniz için bir staff kaydı oluşturun.');
    } else {
      throw new Error('Personel kaydınız bulunamadı. Lütfen yönetici ile iletişime geçin.');
    }
  }

  // ✅ GÜVENLİK: Staff varsa bilgilerini döndür
  return {
    staffId: staff.id,
    fullName: staff.fullName,
    role: staff.role || role
  };
};

// 📝 MÜŞTERİYE NOT EKLE
export const createClientNote = async (req, res) => {
  try {
    const { accountId, id: userId, role } = req.user;
    const { clientId } = req.params;
    const { noteText } = req.body;

    // ✅ GÜVENLİK: Detaylı validasyon
    if (!noteText || noteText.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Not metni boş olamaz'
      });
    }

    // ✅ GÜVENLİK: Not uzunluk kontrolü (max 5000 karakter)
    if (noteText.trim().length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Not metni en fazla 5000 karakter olabilir'
      });
    }

    // ✅ GÜVENLİK: ClientID geçerli mi kontrol et
    if (!clientId || isNaN(parseInt(clientId))) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz müşteri ID'
      });
    }

    // ✅ GÜVENLİK: Kim tarafından yapılan istek?
    let staffInfo;
    try {
      staffInfo = await getStaffInfo(userId, accountId, role);
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    // Müşteri kontrolü
    const client = await prisma.clients.findFirst({
      where: {
        id: parseInt(clientId),
        accountId: accountId
      }
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Müşteri bulunamadı'
      });
    }

    // Not oluştur ve müşteri updatedAt'ını güncelle (transaction ile)
    const note = await prisma.$transaction(async (tx) => {
      // Not oluştur
      const newNote = await tx.clientNotes.create({
        data: {
          accountId: accountId,
          clientId: parseInt(clientId),
          staffId: staffInfo.staffId,
          noteText: noteText.trim()
        },
        include: {
          staff: {
            select: {
              id: true,
              fullName: true,
              role: true
            }
          }
        }
      });

      // Müşteri updatedAt'ını güncelle (frontend sıralaması için)
      await tx.clients.update({
        where: { id: parseInt(clientId) },
        data: { updatedAt: new Date() }
      });

      return newNote;
    });

    res.status(201).json({
      success: true,
      message: 'Not başarıyla eklendi',
      data: note
    });

  } catch (error) {
    console.error('Not ekleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Not eklenirken hata oluştu',
      error: error.message
    });
  }
};

// 📋 MÜŞTERİNİN TÜM NOTLARINI LİSTELE
export const getClientNotes = async (req, res) => {
  try {
    const { accountId, id: userId, role } = req.user;
    const { clientId } = req.params;
    
    // ✅ GÜVENLİK: Pagination kontrolü
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20)); // Max 100, min 1
    const offset = (page - 1) * limit;

    // ✅ GÜVENLİK: ClientID geçerli mi kontrol et
    if (!clientId || isNaN(parseInt(clientId))) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz müşteri ID'
      });
    }

    // ✅ GÜVENLİK: Staff kontrolü ekle
    let staffInfo;
    try {
      staffInfo = await getStaffInfo(userId, accountId, role);
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    // ✅ GÜVENLİK: Müşteri kendi hesabına ait mi kontrol et
    const client = await prisma.clients.findFirst({
      where: {
        id: parseInt(clientId),
        accountId: accountId // ✅ Başka hesabın müşterisine erişemez
      }
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Müşteri bulunamadı'
      });
    }

    // Notları getir
    const [notes, totalCount] = await Promise.all([
      prisma.clientNotes.findMany({
        where: {
          clientId: parseInt(clientId),
          accountId: accountId
        },
        include: {
          staff: {
            select: {
              id: true,
              fullName: true,
              role: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: offset,
        take: limit
      }),
      prisma.clientNotes.count({
        where: {
          clientId: parseInt(clientId),
          accountId: accountId
        }
      })
    ]);

    res.json({
      success: true,
      data: notes,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error('Not listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Notlar listelenirken hata oluştu',
      error: error.message
    });
  }
};

// ✏️ NOT GÜNCELLE
export const updateClientNote = async (req, res) => {
  try {
    const { accountId, id: userId, role } = req.user;
    const { noteId } = req.params;
    const { noteText } = req.body;

    // ✅ GÜVENLİK: Detaylı validasyon
    if (!noteText || noteText.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Not metni boş olamaz'
      });
    }

    // ✅ GÜVENLİK: Not uzunluk kontrolü (max 5000 karakter)
    if (noteText.trim().length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Not metni en fazla 5000 karakter olabilir'
      });
    }

    // ✅ GÜVENLİK: NoteID geçerli mi kontrol et
    if (!noteId || isNaN(parseInt(noteId))) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz not ID'
      });
    }

    // ✅ GÜVENLİK: Kim tarafından yapılan istek?
    let staffInfo;
    try {
      staffInfo = await getStaffInfo(userId, accountId, role);
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    // Not kontrolü
    const existingNote = await prisma.clientNotes.findFirst({
      where: {
        id: parseInt(noteId),
        accountId: accountId
      }
    });

    if (!existingNote) {
      return res.status(404).json({
        success: false,
        message: 'Not bulunamadı'
      });
    }

    // Yetki kontrolü - Sadece kendi notunu veya OWNER/ADMIN güncelleyebilir
    if (existingNote.staffId !== staffInfo.staffId && role !== 'OWNER' && role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Bu notu güncelleme yetkiniz yok'
      });
    }

    // Güncelle ve müşteri updatedAt'ını güncelle (transaction ile)
    const updatedNote = await prisma.$transaction(async (tx) => {
      // Notu güncelle
      const updated = await tx.clientNotes.update({
        where: {
          id: parseInt(noteId)
        },
        data: {
          noteText: noteText.trim()
        },
        include: {
          staff: {
            select: {
              id: true,
              fullName: true,
              role: true
            }
          }
        }
      });

      // Müşteri updatedAt'ını güncelle (frontend sıralaması için)
      await tx.clients.update({
        where: { id: existingNote.clientId },
        data: { updatedAt: new Date() }
      });

      return updated;
    });

    res.json({
      success: true,
      message: 'Not başarıyla güncellendi',
      data: updatedNote
    });

  } catch (error) {
    console.error('Not güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Not güncellenirken hata oluştu',
      error: error.message
    });
  }
};

// 🗑️ NOT SİL
export const deleteClientNote = async (req, res) => {
  try {
    const { accountId, id: userId, role } = req.user;
    const { noteId } = req.params;

    // ✅ GÜVENLİK: NoteID geçerli mi kontrol et
    if (!noteId || isNaN(parseInt(noteId))) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz not ID'
      });
    }

    // ✅ GÜVENLİK: Kim tarafından yapılan istek?
    let staffInfo;
    try {
      staffInfo = await getStaffInfo(userId, accountId, role);
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    // Not kontrolü
    const existingNote = await prisma.clientNotes.findFirst({
      where: {
        id: parseInt(noteId),
        accountId: accountId
      }
    });

    if (!existingNote) {
      return res.status(404).json({
        success: false,
        message: 'Not bulunamadı'
      });
    }

    // Yetki kontrolü - Sadece kendi notunu veya OWNER/ADMIN silebilir
    if (existingNote.staffId !== staffInfo.staffId && role !== 'OWNER' && role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Bu notu silme yetkiniz yok'
      });
    }

    // Sil ve müşteri updatedAt'ını güncelle (transaction ile)
    await prisma.$transaction(async (tx) => {
      // Notu sil
      await tx.clientNotes.delete({
        where: {
          id: parseInt(noteId)
        }
      });

      // Müşteri updatedAt'ını güncelle (frontend sıralaması için)
      await tx.clients.update({
        where: { id: existingNote.clientId },
        data: { updatedAt: new Date() }
      });
    });

    res.json({
      success: true,
      message: 'Not başarıyla silindi'
    });

  } catch (error) {
    console.error('Not silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Not silinirken hata oluştu',
      error: error.message
    });
  }
};

// 📄 TEK NOT DETAY
export const getClientNoteById = async (req, res) => {
  try {
    const { accountId, id: userId, role } = req.user;
    const { noteId } = req.params;

    // ✅ GÜVENLİK: NoteID geçerli mi kontrol et
    if (!noteId || isNaN(parseInt(noteId))) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz not ID'
      });
    }

    // ✅ GÜVENLİK: Staff kontrolü ekle
    let staffInfo;
    try {
      staffInfo = await getStaffInfo(userId, accountId, role);
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    // ✅ GÜVENLİK: Not kendi hesabına ait mi kontrol et
    const note = await prisma.clientNotes.findFirst({
      where: {
        id: parseInt(noteId),
        accountId: accountId // ✅ Başka hesabın notuna erişemez
      },
      include: {
        staff: {
          select: {
            id: true,
            fullName: true,
            role: true
          }
        },
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Not bulunamadı'
      });
    }

    res.json({
      success: true,
      data: note
    });

  } catch (error) {
    console.error('Not detay hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Not bilgisi alınırken hata oluştu',
      error: error.message
    });
  }
};

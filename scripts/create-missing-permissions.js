import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createMissingPermissions() {
  try {
    console.log('🔧 Eksik izinler oluşturuluyor...\n');
    
    // 1. Tüm hesapları getir
    const accounts = await prisma.accounts.findMany({
      select: {
        id: true,
        businessName: true,
        isActive: true
      }
    });

    if (accounts.length === 0) {
      console.log('❌ Hiç hesap bulunamadı!');
      return;
    }

    console.log(`📊 ${accounts.length} hesap bulundu\n`);

    // 2. Oluşturulacak kaynak ve izinler
    const resources = [
      { name: 'services', title: 'Hizmetler' },
      { name: 'clients', title: 'Müşteriler' },
      { name: 'sales', title: 'Satışlar' },
      { name: 'payments', title: 'Ödemeler' },
      { name: 'sessions', title: 'Seanslar' },
      { name: 'appointments', title: 'Randevular' },
      { name: 'staff', title: 'Personel' },
      { name: 'reports', title: 'Raporlar' },
      { name: 'settings', title: 'Ayarlar' }
    ];

    const actions = [
      { name: 'view', title: 'görüntüleme' },
      { name: 'create', title: 'ekleme' },
      { name: 'update', title: 'güncelleme' },
      { name: 'delete', title: 'silme' }
    ];

    // 3. Her hesap için izinleri oluştur
    for (const account of accounts) {
      console.log(`🏢 ${account.businessName} için izinler oluşturuluyor...`);
      
      let createdCount = 0;
      let existingCount = 0;

      for (const resource of resources) {
        for (const action of actions) {
          const permissionName = `${resource.name}_${action.name}`;
          const description = `${resource.title} ${action.title}`;

          try {
            // Upsert kullan - varsa güncelle, yoksa oluştur
            const permission = await prisma.permission.upsert({
              where: {
                accountId_name_resource: {
                  accountId: account.id,
                  name: permissionName,
                  resource: resource.name
                }
              },
              create: {
                accountId: account.id,
                name: permissionName,
                description: description,
                resource: resource.name
              },
              update: {
                description: description
              }
            });

            if (permission.createdAt.getTime() === permission.updatedAt.getTime()) {
              createdCount++;
            } else {
              existingCount++;
            }

          } catch (error) {
            console.error(`   ❌ ${permissionName} oluşturulamadı:`, error.message);
          }
        }
      }

      console.log(`   ✅ ${createdCount} yeni izin oluşturuldu, ${existingCount} mevcut izin güncellendi`);
    }

    // 4. Sonuçları kontrol et
    console.log('\n📋 Oluşturulan izinler kontrol ediliyor...\n');

    for (const account of accounts) {
      const permissions = await prisma.permission.findMany({
        where: { accountId: account.id },
        orderBy: [
          { resource: 'asc' },
          { name: 'asc' }
        ]
      });

      console.log(`🏢 ${account.businessName}: ${permissions.length} izin`);

      // Kaynak bazında grupla
      const groupedPermissions = permissions.reduce((acc, perm) => {
        if (!acc[perm.resource]) {
          acc[perm.resource] = [];
        }
        acc[perm.resource].push(perm);
        return acc;
      }, {});

      Object.keys(groupedPermissions).forEach(resource => {
        const count = groupedPermissions[resource].length;
        console.log(`   📁 ${resource}: ${count} izin`);
      });
    }

    console.log('\n✅ Tüm izinler başarıyla oluşturuldu!');
    console.log('🎉 Artık /api/staff/permissions endpoint\'i çalışmalı!');

  } catch (error) {
    console.error('❌ İzin oluşturma sırasında hata:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Script'i çalıştır
createMissingPermissions();

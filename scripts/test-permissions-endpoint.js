import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testPermissionsEndpoint() {
  try {
    console.log('🔍 Permissions endpoint sorununu araştırıyoruz...\n');
    
    // 1. Hesapları kontrol et
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

    for (const account of accounts) {
      console.log(`🏢 ${account.businessName} (ID: ${account.id})`);
      console.log('─'.repeat(50));

      // 2. Bu hesaba ait 'staff' resource izinlerini kontrol et
      const staffPermissions = await prisma.permission.findMany({
        where: {
          accountId: account.id,
          resource: 'staff'
        },
        orderBy: { name: 'asc' }
      });

      console.log(`🔑 Staff izinleri (${staffPermissions.length} adet):`);
      if (staffPermissions.length === 0) {
        console.log('   ❌ Bu hesaba ait staff izinleri bulunamadı!');
        console.log('   💡 Bu yüzden /api/staff/permissions endpoint\'i çalışmıyor');
        
        // Staff izinlerini oluştur
        console.log('   🔧 Staff izinleri oluşturuluyor...');
        
        const staffPermissionsToCreate = [
          { name: 'staff_view', description: 'Personel görüntüleme', resource: 'staff' },
          { name: 'staff_create', description: 'Personel ekleme', resource: 'staff' },
          { name: 'staff_update', description: 'Personel güncelleme', resource: 'staff' },
          { name: 'staff_delete', description: 'Personel silme', resource: 'staff' }
        ];

        for (const perm of staffPermissionsToCreate) {
          try {
            const created = await prisma.permission.create({
              data: {
                accountId: account.id,
                name: perm.name,
                description: perm.description,
                resource: perm.resource
              }
            });
            console.log(`   ✅ ${perm.name} izni oluşturuldu (ID: ${created.id})`);
          } catch (error) {
            if (error.code === 'P2002') {
              console.log(`   ⚠️  ${perm.name} izni zaten var`);
            } else {
              console.log(`   ❌ ${perm.name} izni oluşturulamadı: ${error.message}`);
            }
          }
        }
      } else {
        staffPermissions.forEach(perm => {
          const action = perm.name.split('_')[1];
          console.log(`   ✅ ${action}: ${perm.description} (ID: ${perm.id})`);
        });
      }

      // 3. Tüm izinleri kontrol et (getAllPermissions fonksiyonunun döneceği veri)
      const allPermissions = await prisma.permission.findMany({
        where: { accountId: account.id },
        orderBy: [
          { resource: 'asc' },
          { name: 'asc' }
        ]
      });

      console.log(`\n📋 Toplam ${allPermissions.length} izin bulundu:`);
      
      // Kaynak bazında grupla
      const groupedPermissions = {};
      allPermissions.forEach(permission => {
        const resource = permission.resource;
        if (!groupedPermissions[resource]) {
          groupedPermissions[resource] = [];
        }
        groupedPermissions[resource].push(permission);
      });

      Object.keys(groupedPermissions).forEach(resource => {
        const count = groupedPermissions[resource].length;
        console.log(`   📁 ${resource}: ${count} izin`);
        
        groupedPermissions[resource].forEach(perm => {
          const action = perm.name.split('_')[1];
          console.log(`      - ${action}: ${perm.description}`);
        });
      });

      // 4. Kullanıcıları kontrol et
      const users = await prisma.user.findMany({
        where: { accountId: account.id },
        select: {
          id: true,
          username: true,
          email: true,
          role: true
        }
      });

      console.log(`\n👥 ${users.length} kullanıcı:`);
      users.forEach(user => {
        console.log(`   👤 ${user.username} (${user.role})`);
        if (user.role === 'OWNER' || user.role === 'ADMIN') {
          console.log(`      ✅ Bu kullanıcı /api/staff/permissions endpoint'ine erişebilir`);
        }
      });

      console.log('\n');
    }

    console.log('✅ Test tamamlandı!');
    console.log('\n💡 Eğer staff izinleri eksikse, yukarıda otomatik olarak oluşturuldu.');
    console.log('   Şimdi /api/staff/permissions endpoint\'i çalışmalı.');

  } catch (error) {
    console.error('❌ Test sırasında hata:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Script'i çalıştır
testPermissionsEndpoint();

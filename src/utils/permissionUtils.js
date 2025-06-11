import prisma from '../lib/prisma.js';

/**
 * @param {number} accountId
 * @param {string} resource
 * @param {string} resourceTitle
 * @param {PrismaClient} [tx]
 * @returns {Promise<Array>} 
 */
const createBasicPermissionsForResource = async (accountId, resource, resourceTitle, tx = prisma) => {
  const permissions = [
    {
      name: `${resource}_view`,
      description: `${resourceTitle} görüntüleme`,
      resource: resource
    },
    {
      name: `${resource}_create`,
      description: `${resourceTitle} ekleme`,
      resource: resource
    },
    {
      name: `${resource}_update`,
      description: `${resourceTitle} güncelleme`,
      resource: resource
    },
    {
      name: `${resource}_delete`,
      description: `${resourceTitle} silme`,
      resource: resource
    }
  ];

  const createdPermissions = [];

  for (const perm of permissions) {
    try {
      const permission = await tx.permission.upsert({
        where: {
          accountId_name_resource: {
            accountId,
            name: perm.name,
            resource: perm.resource
          }
        },
        create: {
          accountId,
          name: perm.name,
          description: perm.description,
          resource: perm.resource
        },
        update: {
          description: perm.description
        }
      });
      
      createdPermissions.push(permission);
    } catch (error) {
      console.error(`İzin oluşturma hatası: ${perm.name}`, error);
    }
  }

  return createdPermissions;
};

/**
 * @param {number} accountId
 * @param {PrismaClient} [tx]
 */
const addBasicPermissionsToAccount = async (accountId, tx = prisma) => {
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

  for (const resource of resources) {
    await createBasicPermissionsForResource(accountId, resource.name, resource.title, tx);
  }
};

/**
 * @param {number} staffId
 * @param {number} accountId
 * @param {string} resource
 * @param {Object} abilities
 * @param {PrismaClient} [tx]
 */
const assignResourcePermissionsToStaff = async (staffId, accountId, resource, abilities, tx = prisma) => {
  // 🛡️ PERMISSION VALIDATION: Görüntüleme izni olmadan diğer izinler verilemez
  const hasViewPermission = abilities.canView || false;
  const hasOtherPermissions = abilities.canCreate || abilities.canEdit || abilities.canDelete;
  
  if (!hasViewPermission && hasOtherPermissions) {
    throw new Error(`${resource} kaynağı için görüntüleme izni olmadan diğer işlemleri yapamazsınız. Önce görüntüleme iznini verin.`);
  }

  const permissions = await tx.permission.findMany({
    where: {
      accountId,
      resource
    }
  });

  for (const permission of permissions) {
    let canView = false;
    let canCreate = false;
    let canEdit = false;
    let canDelete = false;

    if (permission.name === `${resource}_view`) canView = abilities.canView || false;
    if (permission.name === `${resource}_create`) canCreate = abilities.canCreate || false;
    if (permission.name === `${resource}_update`) canEdit = abilities.canEdit || false;
    if (permission.name === `${resource}_delete`) canDelete = abilities.canDelete || false;

    await tx.staffPermission.upsert({
      where: {
        staffId_permissionId: {
          staffId,
          permissionId: permission.id
        }
      },
      create: {
        staffId,
        permissionId: permission.id,
        canView,
        canCreate,
        canEdit,
        canDelete
      },
      update: {
        canView,
        canCreate,
        canEdit,
        canDelete
      }
    });
  }
};

export {
  createBasicPermissionsForResource,
  addBasicPermissionsToAccount,
  assignResourcePermissionsToStaff
}; 
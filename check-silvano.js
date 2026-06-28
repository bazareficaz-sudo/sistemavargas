const Database = require('better-sqlite3');
const db = new Database('C:/Users/DELL/AppData/Roaming/pdv-vargas/pdv-vargas.db', { readonly: true });

const silvano = db.prepare("SELECT * FROM clientes WHERE nome_lower LIKE '%silvano%' LIMIT 1").get();
console.log('CLIENTE:', JSON.stringify(silvano, null, 2));

if (silvano) {
  const creditos = db.prepare("SELECT * FROM creditos_cliente WHERE cliente_id = ?").all(silvano.remote_id);
  console.log('\nCREDITOS_CLIENTE (todos):', JSON.stringify(creditos, null, 2));

  const vendas = db.prepare(`
    SELECT v.numero, v.total, v.forma_pagamento, v.status, v.created_at
    FROM vendas v
    WHERE v.cliente_id = ?
    ORDER BY v.created_at DESC LIMIT 10
  `).all(silvano.id);
  console.log('\nVENDAS:', JSON.stringify(vendas, null, 2));
}
db.close();

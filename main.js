const midtransClient = require('midtrans-client');
const crypto = require('crypto');

module.exports = async ({ req, res, log, error }) => {
    // Inisialisasi Midtrans Snap
    const snap = new midtransClient.Snap({
        isProduction: process.env.IS_PRODUCTION === 'true',
        serverKey: process.env.MIDTRANS_SERVER_KEY,
        clientKey: process.env.MIDTRANS_CLIENT_KEY
    });

    try {
        // ==========================================
        // ROUTE 1: GENERATE TOKEN (Dipanggil dari Flutter)
        // ==========================================
        if (req.path === '/generate-token' && req.method === 'POST') {
            // Ambil data dari body yang dikirim Flutter
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            const { orderId, grossAmount } = body;

            const parameter = {
                transaction_details: {
                    order_id: orderId,
                    gross_amount: grossAmount
                },
            };

            const transaction = await snap.createTransaction(parameter);
            log(`Token berhasil dibuat untuk order: ${orderId}`);
            
            return res.json({ 
                success: true, 
                token: transaction.token,
                redirect_url: transaction.redirect_url 
            });
        }

        // ==========================================
        // ROUTE 2: WEBHOOK / NOTIFICATION (Dipanggil oleh Midtrans)
        // ==========================================
        if (req.path === '/webhook' && req.method === 'POST') {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            
            // 1. Verifikasi Signature Key untuk Keamanan
            const { order_id, status_code, gross_amount, signature_key, transaction_status } = body;
            const serverKey = process.env.MIDTRANS_SERVER_KEY;
            
            const hash = crypto.createHash('sha512').update(`${order_id}${status_code}${gross_amount}${serverKey}`).digest('hex');
            
            if (hash !== signature_key) {
                error('Signature key tidak valid! Potensi fraud.');
                return res.json({ status: 'forbidden' }, 403);
            }

            // 2. Update status pesanan di Database Appwrite berdasarkan transaction_status
            log(`Notifikasi masuk: Order ${order_id} statusnya ${transaction_status}`);
            
            if (transaction_status == 'capture' || transaction_status == 'settlement') {
                // TODO: Update status database Anda menjadi "LUNAS"
            } else if (transaction_status == 'cancel' || transaction_status == 'deny' || transaction_status == 'expire') {
                // TODO: Update status database Anda menjadi "GAGAL/BATAL"
            }

            // Selalu kembalikan HTTP 200 ke Midtrans agar webhook tidak dikirim ulang
            return res.json({ status: 'ok' });
        }

        return res.json({ message: 'Endpoint tidak ditemukan' }, 404);

    } catch (err) {
        error(`Terjadi kesalahan: ${err.message}`);
        return res.json({ success: false, message: err.message }, 500);
    }
};

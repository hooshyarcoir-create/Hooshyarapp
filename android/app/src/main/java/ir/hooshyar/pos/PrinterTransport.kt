package ir.hooshyar.pos

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.content.Context
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import org.json.JSONArray
import org.json.JSONObject
import java.net.InetSocketAddress
import java.net.Socket
import java.util.UUID

/** Result of a low-level ESC/POS delivery, returned to the WebView as JSON. */
data class TransportResult(val ok: Boolean, val message: String) {
    fun json(): String = JSONObject().put("ok", ok).put("message", message).toString()
}

/**
 * Sends ready ESC/POS byte streams (already rasterised Persian text) to
 * network (IP:9100), USB (XPrinter OTG) and Bluetooth SPP thermal printers.
 */
object PrinterTransport {
    private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    fun printTcp(ip: String, port: Int, data: ByteArray): TransportResult {
        if (ip.isBlank()) return TransportResult(false, "آدرس IP چاپگر تنظیم نشده است")
        val socket = Socket()
        return try {
            socket.connect(InetSocketAddress(ip, port), 5000)
            socket.soTimeout = 5000
            val out = socket.outputStream
            out.write(data)
            out.flush()
            TransportResult(true, "ارسال TCP به $ip:$port (${data.size} بایت)")
        } catch (e: Exception) {
            TransportResult(false, "خطای اتصال شبکهای چاپگر: ${e.message}")
        } finally {
            try { socket.close() } catch (_: Exception) {}
        }
    }

    @SuppressLint("MissingPermission")
    fun printBluetooth(context: Context, mac: String, data: ByteArray): TransportResult {
        if (mac.isBlank()) return TransportResult(false, "آدرس MAC چاپگر بلوتوث تنظیم نشده است")
        val adapter = try { BluetoothAdapter.getDefaultAdapter() } catch (e: Exception) { null }
            ?: return TransportResult(false, "بلوتوث روی این دستگاه پشتیبانی نمیشود")
        if (!adapter.isEnabled) return TransportResult(false, "بلوتوث خاموش است")
        var socket: android.bluetooth.BluetoothSocket? = null
        return try {
            val device = adapter.getRemoteDevice(mac)
            socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
            adapter.cancelDiscovery()
            socket.connect()
            val out = socket.outputStream
            out.write(data)
            out.flush()
            TransportResult(true, "ارسال بلوتوث به $mac (${data.size} بایت)")
        } catch (e: SecurityException) {
            TransportResult(false, "مجوز بلوتوث (BLUETOOTH_CONNECT) داده نشده است")
        } catch (e: Exception) {
            TransportResult(false, "خطای چاپگر بلوتوث: ${e.message}")
        } finally {
            try { socket?.close() } catch (_: Exception) {}
        }
    }

    fun findUsbDevice(manager: UsbManager, vendorId: Int, productId: Int): UsbDevice? {
        val list = manager.deviceList.values
        if (vendorId > 0 && productId > 0) {
            val exact = list.firstOrNull { it.vendorId == vendorId && it.productId == productId }
            if (exact != null) return exact
        }
        if (vendorId > 0) list.firstOrNull { it.vendorId == vendorId }?.let { return it }
        return list.firstOrNull { d ->
            (0 until d.interfaceCount).any { d.getInterface(it).interfaceClass == UsbConstants.USB_CLASS_PRINTER }
        }
    }

    private fun bulkOut(intf: UsbInterface): UsbEndpoint? =
        (0 until intf.endpointCount)
            .map { intf.getEndpoint(it) }
            .firstOrNull { it.type == UsbConstants.USB_ENDPOINT_XFER_BULK && it.direction == UsbConstants.USB_DIR_OUT }

    fun printUsb(manager: UsbManager, device: UsbDevice, data: ByteArray): TransportResult {
        val connection = try { manager.openDevice(device) } catch (e: Exception) { null }
            ?: return TransportResult(false, "امکان باز کردن اتصال USB وجود ندارد")
        val intf = (0 until device.interfaceCount)
            .map { device.getInterface(it) }
            .firstOrNull { it.interfaceClass == UsbConstants.USB_CLASS_PRINTER || bulkOut(it) != null }
            ?: return TransportResult(false, "رابط چاپگر USB یافت نشد")
        val endpoint = bulkOut(intf) ?: return TransportResult(false, "خروجی Bulk چاپگر یافت نشد")
        val claimed = try { connection.claimInterface(intf, true) } catch (e: Exception) { false }
        if (!claimed) return TransportResult(false, "عدم موفقیت در تصاحب رابط USB")
        return try {
            var offset = 0
            var guard = 0
            while (offset < data.size && guard < 2000) {
                val len = minOf(8192, data.size - offset)
                val sent = connection.bulkTransfer(endpoint, data, offset, len, 5000)
                if (sent <= 0) return TransportResult(false, "خطا در ارسال داده به چاپگر USB")
                offset += sent
                guard++
            }
            TransportResult(true, "ارسال USB به ${device.deviceName} (${data.size} بایت)")
        } catch (e: Exception) {
            TransportResult(false, "خطای چاپگر USB: ${e.message}")
        } finally {
            try { connection.releaseInterface(intf) } catch (_: Exception) {}
            try { connection.close() } catch (_: Exception) {}
        }
    }

    fun listUsb(manager: UsbManager): String {
        val arr = JSONArray()
        manager.deviceList.values.forEach { d ->
            arr.put(JSONObject()
                .put("name", "USB ${d.vendorId}/${d.productId}")
                .put("vendorId", d.vendorId)
                .put("productId", d.productId)
                .put("deviceName", d.deviceName)
                .put("hasPermission", manager.hasPermission(d)))
        }
        return arr.toString()
    }

    @SuppressLint("MissingPermission")
    fun listBluetooth(): String {
        val arr = JSONArray()
        val adapter = try { BluetoothAdapter.getDefaultAdapter() } catch (e: Exception) { null }
        if (adapter != null) {
            try {
                adapter.bondedDevices.forEach { d ->
                    arr.put(JSONObject().put("name", d.name ?: "چاپگر").put("mac", d.address))
                }
            } catch (e: SecurityException) {
                return JSONArray().put(JSONObject().put("name", "مجوز بلوتوث لازم است").put("mac", "")).toString()
            }
        }
        return arr.toString()
    }
}

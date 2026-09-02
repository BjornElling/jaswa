//! The small, explicit Windows boundary for the helper.
//!
//! The helper needs elevation for its documented local certificate and
//! loopback routing.  Calling command interpreters for those operations made
//! that ordinary behaviour indistinguishable from a dropper, so this module
//! uses the Windows APIs directly instead.

use std::{ffi::c_void, io, ptr};
use windows_sys::Win32::{
    Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
    Security::Cryptography::{
        CERT_FIND_SUBJECT_STR_W, CERT_STORE_ADD_REPLACE_EXISTING, CERT_SYSTEM_STORE_LOCAL_MACHINE,
        CertAddEncodedCertificateToStore, CertCloseStore, CertDeleteCertificateFromStore,
        CertFindCertificateInStore, CertOpenStore, PKCS_7_ASN_ENCODING, X509_ASN_ENCODING,
    },
    System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
        TH32CS_SNAPPROCESS,
    },
    UI::{
        Shell::{IsUserAnAdmin, ShellExecuteW},
        WindowsAndMessaging::{
            IDYES, MB_ICONERROR, MB_ICONWARNING, MB_OK, MB_YESNO, MessageBoxW, SW_SHOWNORMAL,
        },
    },
};

const ROOT_STORE: &[u16] = &[b'R' as u16, b'O' as u16, b'O' as u16, b'T' as u16, 0];
const SYSTEM_STORE_PROVIDER: &[u8] = b"System\0";

pub fn is_administrator() -> bool {
    unsafe { IsUserAnAdmin() != 0 }
}

pub fn restart_elevated(executable: &str) -> Result<(), String> {
    let verb = wide("runas");
    let file = wide(executable);
    let parameters = wide("--jaswa-elevated");
    let result = unsafe {
        ShellExecuteW(
            ptr::null_mut(),
            verb.as_ptr(),
            file.as_ptr(),
            parameters.as_ptr(),
            ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if result as isize > 32 {
        Ok(())
    } else {
        Err("The Windows elevation request was declined.".into())
    }
}

pub fn open(path: &str) {
    let verb = wide("open");
    let file = wide(path);
    unsafe {
        ShellExecuteW(
            ptr::null_mut(),
            verb.as_ptr(),
            file.as_ptr(),
            ptr::null(),
            ptr::null(),
            SW_SHOWNORMAL,
        );
    }
}

pub fn show_error(message: &str) {
    message_box(message, "JASWA Helper", MB_OK | MB_ICONERROR);
}

pub fn confirm_certificate_installation() -> bool {
    message_box(
        "JASWA Helper needs to install its local certificate. This lets it read Summoners War safely on this computer. The helper cannot run without it.",
        "Install the JASWA Helper certificate",
        MB_YESNO | MB_ICONWARNING,
    ) == IDYES
}

fn message_box(message: &str, title: &str, style: u32) -> i32 {
    let message = wide(message);
    let title = wide(title);
    unsafe { MessageBoxW(ptr::null_mut(), message.as_ptr(), title.as_ptr(), style) }
}

pub fn install_root_certificate(encoded: &[u8]) -> Result<(), String> {
    let store = open_root_store()?;
    let result = unsafe {
        CertAddEncodedCertificateToStore(
            store,
            X509_ASN_ENCODING | PKCS_7_ASN_ENCODING,
            encoded.as_ptr(),
            encoded.len() as u32,
            CERT_STORE_ADD_REPLACE_EXISTING,
            ptr::null_mut(),
        )
    };
    unsafe {
        CertCloseStore(store, 0);
    }
    if result != 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error().to_string())
    }
}

pub fn remove_root_certificate(subject: &str) -> Result<(), String> {
    let store = open_root_store()?;
    let subject = wide(subject);
    let certificate = unsafe {
        CertFindCertificateInStore(
            store,
            X509_ASN_ENCODING | PKCS_7_ASN_ENCODING,
            0,
            CERT_FIND_SUBJECT_STR_W,
            subject.as_ptr().cast::<c_void>(),
            ptr::null(),
        )
    };
    if certificate.is_null() {
        unsafe {
            CertCloseStore(store, 0);
        }
        return Ok(());
    }
    let deleted = unsafe { CertDeleteCertificateFromStore(certificate) };
    unsafe {
        CertCloseStore(store, 0);
    }
    if deleted != 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error().to_string())
    }
}

pub fn process_running(executable: &str) -> bool {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return false;
    }
    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };
    let mut found = false;
    let mut next = unsafe { Process32FirstW(snapshot, &mut entry) };
    while next != 0 {
        let length = entry
            .szExeFile
            .iter()
            .position(|character| *character == 0)
            .unwrap_or(entry.szExeFile.len());
        if String::from_utf16_lossy(&entry.szExeFile[..length]).eq_ignore_ascii_case(executable) {
            found = true;
            break;
        }
        next = unsafe { Process32NextW(snapshot, &mut entry) };
    }
    unsafe {
        CloseHandle(snapshot);
    }
    found
}

fn open_root_store() -> Result<*mut c_void, String> {
    let store = unsafe {
        CertOpenStore(
            SYSTEM_STORE_PROVIDER.as_ptr(),
            0,
            0,
            CERT_SYSTEM_STORE_LOCAL_MACHINE,
            ROOT_STORE.as_ptr().cast::<c_void>(),
        )
    };
    if store.is_null() {
        Err(io::Error::last_os_error().to_string())
    } else {
        Ok(store)
    }
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

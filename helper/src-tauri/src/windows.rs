//! The small, explicit Windows boundary for the helper.
//!
//! The helper needs elevation for its documented loopback routing; its local
//! certificate goes into the current user's store and needs none.  Calling
//! command interpreters for those operations made that ordinary behaviour
//! indistinguishable from a dropper, so this module uses the Windows APIs
//! directly instead.

use std::{ffi::c_void, io, ptr};
use windows_sys::Win32::{
    Foundation::{CloseHandle, ERROR_ALREADY_EXISTS, GetLastError, HANDLE},
    Security::Cryptography::{
        CERT_FIND_SUBJECT_STR_W, CERT_STORE_ADD_REPLACE_EXISTING, CERT_SYSTEM_STORE_CURRENT_USER,
        CERT_SYSTEM_STORE_LOCAL_MACHINE, CertAddEncodedCertificateToStore, CertCloseStore,
        CertDeleteCertificateFromStore, CertFindCertificateInStore, CertFreeCertificateContext,
        CertOpenStore, PKCS_7_ASN_ENCODING, X509_ASN_ENCODING,
    },
    System::Threading::CreateMutexW,
    UI::{
        Shell::{IsUserAnAdmin, ShellExecuteW},
        WindowsAndMessaging::{
            IDYES, MB_ICONERROR, MB_ICONWARNING, MB_OK, MB_YESNO, MessageBoxW, SW_SHOWNORMAL,
        },
    },
};

const ROOT_STORE: &[u16] = &[b'R' as u16, b'O' as u16, b'O' as u16, b'T' as u16, 0];
const SYSTEM_STORE_PROVIDER: &[u8] = b"System\0";
const ROOT_SUBJECT: &str = "JASWA Helper Local Root";

pub struct InstanceGuard(HANDLE);
impl Drop for InstanceGuard {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}

/// A second launch must not truncate the active log or undo its redirect.
pub fn claim_instance() -> Result<InstanceGuard, String> {
    let name = wide("Local\\JASWAHelper");
    let handle = unsafe { CreateMutexW(ptr::null(), 0, name.as_ptr()) };
    if handle.is_null() {
        return Err(io::Error::last_os_error().to_string());
    }
    let existing = unsafe { GetLastError() } == ERROR_ALREADY_EXISTS;
    let guard = InstanceGuard(handle);
    if existing {
        return Err("JASWA Helper is already running. Open it from the system tray.".into());
    }
    Ok(guard)
}

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

pub fn open(path: &str) -> Result<(), String> {
    let verb = wide("open");
    let file = wide(path);
    let result = unsafe {
        ShellExecuteW(
            ptr::null_mut(),
            verb.as_ptr(),
            file.as_ptr(),
            ptr::null(),
            ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if result as isize > 32 {
        Ok(())
    } else {
        Err(format!(
            "Windows could not open {path} (shell error {}).",
            result as isize
        ))
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

/// Installs the local root into the *current user's* ROOT store, not the
/// machine-wide one. The game runs as this user and trusts the per-user store,
/// so it needs no elevation for the certificate; and a per-user root avoids the
/// machine-wide-root-store write that antivirus heuristics treat as the
/// defining action of a TLS-intercepting dropper.
pub fn install_root_certificate(encoded: &[u8]) -> Result<(), String> {
    /* A helper from the earlier installer put this exact certificate in the
       machine store. Reusing it is safe and avoids asking Windows to rewrite a
       root-store entry during an upgrade, which can be denied even though the
       certificate is already trusted and the new helper needs no new trust. */
    let already_in_user_store =
        has_matching_certificate(encoded, CERT_SYSTEM_STORE_CURRENT_USER).unwrap_or(false);
    let already_in_machine_store =
        has_matching_certificate(encoded, CERT_SYSTEM_STORE_LOCAL_MACHINE).unwrap_or(false);
    if already_in_user_store || already_in_machine_store {
        return Ok(());
    }
    let store = open_root_store(CERT_SYSTEM_STORE_CURRENT_USER)?;
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

/// Remove the current-user root and, when permitted, the machine root left by
/// the older installer. The machine-store removal is best effort because an
/// explicit uninstall should not fail merely because an obsolete root is
/// already gone or protected by policy.
pub fn remove_root_certificate(subject: &str) -> Result<(), String> {
    remove_from_store(subject, CERT_SYSTEM_STORE_CURRENT_USER)?;
    let _ = remove_from_store(subject, CERT_SYSTEM_STORE_LOCAL_MACHINE);
    Ok(())
}

fn has_matching_certificate(encoded: &[u8], store_id: u32) -> Result<bool, String> {
    let store = open_root_store(store_id)?;
    let subject = wide(ROOT_SUBJECT);
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
        return Ok(false);
    }
    let matching = unsafe {
        let context = &*certificate;
        context.cbCertEncoded as usize == encoded.len()
            && !context.pbCertEncoded.is_null()
            && std::slice::from_raw_parts(context.pbCertEncoded, context.cbCertEncoded as usize)
                == encoded
    };
    unsafe {
        CertFreeCertificateContext(certificate);
        CertCloseStore(store, 0);
    }
    Ok(matching)
}

fn remove_from_store(subject: &str, store_id: u32) -> Result<(), String> {
    let store = open_root_store(store_id)?;
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

fn open_root_store(store_id: u32) -> Result<*mut c_void, String> {
    let store = unsafe {
        CertOpenStore(
            SYSTEM_STORE_PROVIDER.as_ptr(),
            0,
            0,
            store_id,
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

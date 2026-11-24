package com.agentsbakery.myequal;

import android.Manifest;
import android.database.Cursor;
import android.os.CancellationSignal;
import android.provider.CallLog;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

/**
 * What the My Equal pages cannot do on their own (web/app/native.ts is the other side):
 *  - Google sign-in with the phone's account picker. Google does not allow its web sign-in inside an
 *    app's web view. The ID token is issued for the web client ID, so the server checks it as before.
 *  - The phone's call log, read with the person's permission and handed to the page, which matches
 *    it to people on the phone (web/lib/phonecalls.ts). Nothing here sends it anywhere.
 */
@CapacitorPlugin(name = "Equal", permissions = { @Permission(alias = "callLog", strings = { Manifest.permission.READ_CALL_LOG }) })
public class EqualPlugin extends Plugin {

    private static final int MAX_CALLS = 2000;

    @PluginMethod
    public void googleSignIn(PluginCall call) {
        String clientId = call.getString("clientId");
        if (clientId == null || clientId.isEmpty()) {
            call.reject("Google sign-in is not set up on this server yet.");
            return;
        }
        GetGoogleIdOption option = new GetGoogleIdOption.Builder()
            .setServerClientId(clientId)
            .setFilterByAuthorizedAccounts(false)
            .setAutoSelectEnabled(false)
            .build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        CredentialManager.create(getContext()).getCredentialAsync(
            getActivity(),
            request,
            new CancellationSignal(),
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    if (result.getCredential() instanceof CustomCredential
                        && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(result.getCredential().getType())) {
                        GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(((CustomCredential) result.getCredential()).getData());
                        JSObject out = new JSObject();
                        out.put("credential", google.getIdToken());
                        call.resolve(out);
                    } else {
                        call.reject("That sign-in was not a Google account.");
                    }
                }

                @Override
                public void onError(@NonNull GetCredentialException e) {
                    call.reject(e instanceof GetCredentialCancellationException ? "Sign-in was cancelled." : "Google sign-in did not work on this phone: " + e.getMessage());
                }
            }
        );
    }

    @PluginMethod
    public void callLogAllowed(PluginCall call) {
        JSObject out = new JSObject();
        out.put("allowed", getPermissionState("callLog") == PermissionState.GRANTED);
        call.resolve(out);
    }

    @PluginMethod
    public void callLog(PluginCall call) {
        if (getPermissionState("callLog") != PermissionState.GRANTED) {
            requestPermissionForAlias("callLog", call, "afterCallLogPermission");
            return;
        }
        readCalls(call);
    }

    @PermissionCallback
    private void afterCallLogPermission(PluginCall call) {
        if (getPermissionState("callLog") == PermissionState.GRANTED) readCalls(call);
        else call.reject("Permission to read calls was not given. You can allow it in the phone's settings for My Equal.");
    }

    private void readCalls(PluginCall call) {
        long since = call.getLong("since", 0L);
        String[] columns = { CallLog.Calls.NUMBER, CallLog.Calls.CACHED_NAME, CallLog.Calls.TYPE, CallLog.Calls.DATE, CallLog.Calls.DURATION };
        JSArray calls = new JSArray();
        try (Cursor c = getContext().getContentResolver().query(CallLog.Calls.CONTENT_URI, columns, CallLog.Calls.DATE + " >= ?", new String[] { String.valueOf(since) }, CallLog.Calls.DATE + " DESC")) {
            while (c != null && c.moveToNext() && calls.length() < MAX_CALLS) {
                JSObject one = new JSObject();
                one.put("number", c.getString(0) == null ? "" : c.getString(0));
                one.put("name", c.getString(1));
                one.put("type", c.getInt(2));
                one.put("at", c.getLong(3));
                one.put("secs", c.getLong(4));
                calls.put(one);
            }
        } catch (SecurityException e) {
            call.reject("Permission to read calls was not given.");
            return;
        }
        JSObject out = new JSObject();
        out.put("calls", calls);
        call.resolve(out);
    }
}

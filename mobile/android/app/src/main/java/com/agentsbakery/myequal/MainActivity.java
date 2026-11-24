package com.agentsbakery.myequal;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EqualPlugin.class); // before super: plugins are read when the bridge starts
        super.onCreate(savedInstanceState);
    }
}

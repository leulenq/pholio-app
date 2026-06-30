// client/src/domains/talent/pages/ProfilePage/phylloWrapper.js

class MockPhylloConnect {
  constructor(config) {
    this.config = config;
    this.callbacks = {};
  }

  on(event, callback) {
    this.callbacks[event] = callback;
  }

  open() {
    console.log("[Phyllo Wrapper] Opening Mock Phyllo overlay", this.config);
    
    // Create popup/modal element
    const overlay = document.createElement("div");
    overlay.id = "mock-phyllo-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.backgroundColor = "rgba(5, 5, 5, 0.85)";
    overlay.style.backdropFilter = "blur(12px)";
    overlay.style.display = "flex";
    overlay.style.justify = "center";
    overlay.style.alignItems = "center";
    overlay.style.zIndex = "999999";
    overlay.style.fontFamily = "'Inter', sans-serif";

    // Detect work platform or let user pick one
    const modal = document.createElement("div");
    modal.style.width = "100%";
    modal.style.maxWidth = "440px";
    modal.style.backgroundColor = "#FFFFFF";
    modal.style.borderRadius = "16px";
    modal.style.border = "1px solid rgba(184, 149, 106, 0.2)";
    modal.style.overflow = "hidden";
    modal.style.boxShadow = "0 20px 40px rgba(0, 0, 0, 0.3)";
    modal.style.display = "flex";
    modal.style.flexDirection = "column";

    // Header styling
    modal.innerHTML = `
      <div style="background: linear-gradient(135deg, #121212 0%, #2a2a2a 100%); padding: 24px; text-align: center; color: #FFFFFF;">
        <h2 style="font-family: 'Playfair Display', serif; font-size: 24px; margin: 0; font-weight: 700; color: #C9A55A;">Phyllo Connect</h2>
        <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 4px 0 0; opacity: 0.8;">Verification Sandbox</p>
      </div>
      <div style="padding: 28px 24px; display: flex; flex-direction: column; gap: 20px;">
        <p style="font-size: 14px; line-height: 1.5; color: #6B6560; text-align: center; margin: 0;">
          Select a platform to connect your creator account to <strong>${this.config.clientDisplayName || "Pholio"}</strong>.
        </p>
        
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <label style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #1A1815;">Platform</label>
          <select id="mock-platform" style="width: 100%; padding: 12px; border: 1px solid rgba(184,149,106,0.3); border-radius: 8px; font-size: 14px; outline: none; background-color: #FFFFFF;">
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube</option>
          </select>
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          <label style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #1A1815;">Username / Handle</label>
          <div style="position: relative; display: flex; align-items: center;">
            <span style="position: absolute; left: 12px; color: #6B6560; font-weight: 500;">@</span>
            <input type="text" id="mock-username" placeholder="creator_handle" style="width: 100%; padding: 12px 12px 12px 28px; border: 1px solid rgba(184,149,106,0.3); border-radius: 8px; font-size: 14px; outline: none;" value="sterlingmgmt" />
          </div>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px;">
          <button id="mock-cancel" type="button" class="pholio-btn pholio-btn--secondary">
            Cancel
          </button>
          <button id="mock-connect" type="button" class="pholio-btn pholio-btn--primary">
            Connect Account
          </button>
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Cancel action
    document.getElementById("mock-cancel").onclick = () => {
      document.body.removeChild(overlay);
      if (this.callbacks["exit"]) {
        this.callbacks["exit"]("USER_CANCELLED", this.config.userId);
      }
    };

    // Connect action
    document.getElementById("mock-connect").onclick = () => {
      const platform = document.getElementById("mock-platform").value;
      const username = document.getElementById("mock-username").value.trim();
      
      if (!username) {
        alert("Please enter a username.");
        return;
      }

      document.body.removeChild(overlay);

      // Trigger Phyllo accountConnected callback
      const mockAccountId = `acc_mock_${platform}_${crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).substr(2, 8)}`;
      const mockWorkplatformId = `${platform}_platform`;

      if (this.callbacks["accountConnected"]) {
        this.callbacks["accountConnected"](mockAccountId, mockWorkplatformId, this.config.userId);
      }
    };
  }
}

export const phylloWrapper = {
  initialize(config) {
    if (config.token && config.token.startsWith("mock_sdk_")) {
      return new MockPhylloConnect(config);
    }
    
    // Check if PhylloConnect script is loaded on window
    if (window.PhylloConnect) {
      return window.PhylloConnect.initialize(config);
    } else {
      console.warn("[Phyllo Wrapper] Real PhylloConnect SDK script not loaded, falling back to mock.");
      return new MockPhylloConnect(config);
    }
  }
};

const SUPABASE_URL = "https://ryyhzptmpmqnhgyzzxin.supabase.co";
const SUPABASE_KEY = "sb_publishable_0zFsYtEPHozL_bONYnbBkg_QToxw6P-";

/**
 * Cliente simples para comunicação com Supabase via REST API
 */
const Supabase = {
  fetch: function(path, options = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${path}`;
    const defaultOptions = {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      muteHttpExceptions: true
    };
    
    // Mesclar headers se fornecidos
    const finalOptions = { ...defaultOptions, ...options };
    if (options.headers) {
      finalOptions.headers = { ...defaultOptions.headers, ...options.headers };
    }
    
    if (options.payload) {
      finalOptions.payload = JSON.stringify(options.payload);
    }

    const response = UrlFetchApp.fetch(url, finalOptions);
    const content = response.getContentText();
    const code = response.getResponseCode();
    
    try {
      const json = JSON.parse(content);
      if (code >= 400) {
        return { sucesso: false, erro: json.message || content, status: code };
      }
      return { sucesso: true, data: json };
    } catch (e) {
      if (code >= 200 && code < 300) return { sucesso: true, data: content };
      return { sucesso: false, erro: content, status: code };
    }
  },

  select: function(table, query = "*") {
    return this.fetch(`${table}?select=${query}`);
  },

  insert: function(table, data) {
    return this.fetch(table, {
      method: 'POST',
      payload: data
    });
  },

  update: function(table, data, matchQuery) {
    return this.fetch(`${table}?${matchQuery}`, {
      method: 'PATCH',
      payload: data
    });
  },

  upsert: function(table, data) {
    return this.fetch(table, {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      payload: data
    });
  },

  delete: function(table, matchQuery) {
    return this.fetch(`${table}?${matchQuery}`, {
      method: 'DELETE'
    });
  },

  rpc: function(functionName, params) {
    return this.fetch(`rpc/${functionName}`, {
      method: 'POST',
      payload: params
    });
  }
};

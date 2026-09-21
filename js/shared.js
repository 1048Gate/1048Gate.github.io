(function(){
  const MEMBER_ROLE_OVERRIDES = Object.freeze({'10': 'Admin'});

  const escapeHtml = value => String(value ?? '').replace(/[&<>'\" ]/g, character => ({
    '&': '&',
    '<': '<',
    '>': '>',
    "'": '&#39;',
    '"': '"'
  }[character]));

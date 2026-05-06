const uploadForm = document.getElementById('uploadForm');
const contactsSection = document.getElementById('contactsSection');
const contactTableBody = document.getElementById('contactTableBody');
const fieldButtons = document.getElementById('fieldButtons');
const composeSection = document.getElementById('composeSection');
const fieldSummary = document.getElementById('fieldSummary');
const selectedCount = document.getElementById('selectedCount');
const filterInput = document.getElementById('filterInput');
const selectAllButton = document.getElementById('selectAllButton');
const deselectAllButton = document.getElementById('deselectAllButton');
const loginSection = document.getElementById('loginSection');
const appContent = document.getElementById('appContent');
const userInfo = document.getElementById('userInfo');
const userEmail = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');
const activeInput = { element: null };

let contacts = [];
let fields = [];

// Check authentication on page load
window.addEventListener('load', async () => {
  try {
    const response = await fetch('/auth-status');
    const data = await response.json();
    
    if (data.authenticated) {
      loginSection.style.display = 'none';
      appContent.style.display = 'grid';
      userInfo.style.display = 'block';
      userEmail.textContent = `Logged in as: ${data.email}`;
    } else {
      loginSection.style.display = 'block';
      appContent.style.display = 'none';
      userInfo.style.display = 'none';
    }
  } catch (error) {
    console.error('Error checking authentication:', error);
    loginSection.style.display = 'block';
    appContent.style.display = 'none';
  }
});

// Handle logout
logoutBtn.addEventListener('click', async () => {
  try {
    await fetch('/logout');
    window.location.reload();
  } catch (error) {
    console.error('Error logging out:', error);
  }
});

function getEmailColumn(contact) {
  const keys = Object.keys(contact);
  return keys.find((key) => /email/i.test(key));
}

function getAllEmailColumns(contact) {
  const keys = Object.keys(contact);
  return keys.filter((key) => /email/i.test(key));
}

function getPupilColumn(contact) {
  const keys = Object.keys(contact);
  return keys.find((key) => {
    const normalized = key.toLowerCase();
    return /^(pupil|name|student|full name)/.test(normalized) || normalized === 'name';
  });
}

function buildFieldButtons() {
  fieldButtons.innerHTML = '';
  if (!fields.length) return;
  fields.forEach((field) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary';
    button.textContent = `{{${field}}}`;
    button.addEventListener('click', () => {
      insertAtCursor(activeInput.element || document.getElementById('body'), `{{${field}}}`);
    });
    fieldButtons.appendChild(button);
  });
}

function insertAtCursor(el, value) {
  if (!el) return;
  el.focus();
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const text = el.value;
  el.value = text.slice(0, start) + value + text.slice(end);
  el.setSelectionRange(start + value.length, start + value.length);
}

function displayContacts() {
  contactTableBody.innerHTML = '';
  contacts.forEach((contact, index) => {
    const row = document.createElement('tr');
    const emailCol = getEmailColumn(contact);
    const pupilCol = getPupilColumn(contact);
    let email = emailCol ? String(contact[emailCol]).trim() : '';
    
    // Fallback to Email2 if Email is empty
    if (!email) {
      const email2Col = Object.keys(contact).find((key) => /email.?2/i.test(key));
      if (email2Col) {
        email = String(contact[email2Col]).trim();
      }
    }
    
    const name = pupilCol ? String(contact[pupilCol]).trim() : 'Unknown';
    
    // Show all fields with values
    const allFields = Object.entries(contact)
      .filter(([key, value]) => String(value).trim())
      .map(([key, value]) => `<span class="label-pill">${key}: ${value}</span>`)
      .join(' ');
    
    row.innerHTML = `
      <td><input type="checkbox" class="contact-checkbox" data-index="${index}"></td>
      <td>${name}</td>
      <td>${email}</td>
      <td>${allFields}</td>
    `;
    contactTableBody.appendChild(row);
  });
  updateSelectedCount();
}

function updateSelectedCount() {
  const selected = document.querySelectorAll('.contact-checkbox:checked').length;
  selectedCount.textContent = `${selected} contact${selected === 1 ? '' : 's'} selected`;
}

function filterContacts() {
  const query = filterInput.value.toLowerCase();
  document.querySelectorAll('.contact-checkbox').forEach((checkbox) => {
    const row = checkbox.closest('tr');
    const cells = Array.from(row.querySelectorAll('td')).slice(1);
    const text = cells.map((cell) => cell.textContent.toLowerCase()).join(' ');
    row.style.display = text.includes(query) ? '' : 'none';
  });
}

function collectRecipients() {
  return Array.from(document.querySelectorAll('.contact-checkbox:checked')).map((checkbox) => {
    const index = Number(checkbox.dataset.index);
    return contacts[index];
  });
}

async function uploadExcel(event) {
  event.preventDefault();
  const fileInput = document.getElementById('excelFile');
  if (!fileInput.files.length) return;
  const formData = new FormData();
  formData.append('excel', fileInput.files[0]);

  try {
    const response = await fetch('/upload', { method: 'POST', body: formData });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Upload failed');
    }
    const payload = await response.json();
    contacts = payload.contacts || [];
    fields = (payload.fields || []).filter((field) => String(field).trim());
    if (!contacts.length) {
      alert('No contacts found in the Excel file.');
      return;
    }
    contactsSection.classList.remove('hidden');
    composeSection.classList.remove('hidden');
    fieldSummary.textContent = fields.join(', ');
    buildFieldButtons();
    displayContacts();
  } catch (error) {
    alert('Error uploading file: ' + error.message);
  }
}

async function sendEmails(event) {
  event.preventDefault();
  const recipients = collectRecipients();
  if (!recipients.length) {
    alert('Select at least one contact before sending.');
    return;
  }

  const payload = {
    subject: document.getElementById('subject').value,
    body: document.getElementById('body').value,
    recipients
  };

  try {
    const response = await fetch('/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.text();
    if (!response.ok) throw new Error(result || 'Send failed');
    alert('Emails sent successfully!');
  } catch (error) {
    alert('Error sending emails: ' + error.message);
  }
}

uploadForm.addEventListener('submit', uploadExcel);
composeSection.addEventListener('submit', sendEmails);
filterInput.addEventListener('input', filterContacts);
selectAllButton.addEventListener('click', () => {
  document.querySelectorAll('.contact-checkbox').forEach((cb) => {
    const row = cb.closest('tr');
    if (row.style.display !== 'none') {
      cb.checked = true;
    }
  });
  updateSelectedCount();
});
deselectAllButton.addEventListener('click', () => {
  document.querySelectorAll('.contact-checkbox').forEach((cb) => {
    const row = cb.closest('tr');
    if (row.style.display !== 'none') {
      cb.checked = false;
    }
  });
  updateSelectedCount();
});

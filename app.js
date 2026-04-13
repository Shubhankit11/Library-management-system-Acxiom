const state = {
  currentUser: null,
  selectedBookId: null,
  pendingReturn: null,
  selectedReturnBookId: null,
  selectedMembershipNo: null,
  books: [
    { id: 1, type: "book", title: "Helen Keller", author: "Helen Keller", serialNo: "B1001", available: true },
    { id: 2, type: "book", title: "Gitanjali", author: "Rabindra Nath Tagore", serialNo: "B1002", available: true },
    { id: 3, type: "book", title: "The Guide", author: " RK Narayan ", serialNo: "B1003", available: true },
    { id: 4, type: "movie", title: "Trirangaa", author: " Mehul Kumar ", serialNo: "M1001", available: true }
  ],
  memberships: [],
  transactions: [],
  appUsers: [{ username: "Shubhankit", password: "admin123", role: "admin", name: "Administrator" }, { username: "user", password: "user123", role: "user", name: "Regular User" },{ username: "user1", password: "user1234", role: "user", name: "Regular User" }]
};


const app = document.getElementById("app");
const sessionInfo = document.getElementById("sessionInfo");

const STORAGE_KEY = "lms_state_v1";
const defaults = JSON.parse(JSON.stringify({
  books: state.books,
  memberships: state.memberships,
  appUsers: state.appUsers
}));

const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
};
const addMonths = (d, n) => {
  const dt = new Date(d);
  dt.setMonth(dt.getMonth() + n);
  return dt.toISOString().slice(0, 10);
};
const durationToMonths = (duration) => ({ "6m": 6, "1y": 12, "2y": 24 }[duration] || 6);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");
const nextId = () => Date.now() + Math.floor(Math.random() * 1000);

window.addEventListener("hashchange", render);
document.addEventListener("click", handleClick);
document.addEventListener("submit", handleSubmit);
document.addEventListener("change", handleChange);

hydrate();
render();

function hydrate() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (Array.isArray(saved.books)) state.books = saved.books;
    if (Array.isArray(saved.memberships)) state.memberships = saved.memberships;
    if (Array.isArray(saved.transactions)) state.transactions = saved.transactions;
    if (Array.isArray(saved.appUsers)) state.appUsers = saved.appUsers;
  } catch {
    // ignore corrupted storage
  }
  recomputeMembershipStatuses();
}

function persist() {
  const payload = {
    books: state.books,
    memberships: state.memberships,
    transactions: state.transactions,
    appUsers: state.appUsers
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function resetData() {
  state.books = JSON.parse(JSON.stringify(defaults.books));
  state.memberships = JSON.parse(JSON.stringify(defaults.memberships));
  state.transactions = [];
  state.appUsers = JSON.parse(JSON.stringify(defaults.appUsers));
  persist();
}

function membershipStatus(membership) {
  if (!membership.active) return "Cancelled";
  if (!membership.endDate) return "Active";
  return membership.endDate < todayStr() ? "Expired" : "Active";
}

function recomputeMembershipStatuses() {
  state.memberships.forEach((membership) => {
    membership.status = membershipStatus(membership);
  });
}

function createMembershipRecord({ membershipNo, name, duration }) {
  const startDate = todayStr();
  const endDate = addMonths(startDate, durationToMonths(duration));
  return {
    membershipNo,
    name,
    duration,
    startDate,
    endDate,
    active: true,
    status: "Active"
  };
}

function issueTransactionForBook(bookId) {
  return [...state.transactions].reverse().find((t) => t.bookId === bookId && t.type === "issue" && !t.closed);
}

function buildTable(headers, rows) {
  return `
    <table>
      <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}">No records</td></tr>`}</tbody>
    </table>
  `;
}

function render() {
  if (!state.currentUser) return renderLogin();
  const hash = window.location.hash || "#/home";
  sessionInfo.textContent = `${state.currentUser.name} (${state.currentUser.role})`;
  const nav = `
    <div class="card nav">
      <a href="#/home">Home</a>
      ${state.currentUser.role === "admin" ? '<a href="#/maintenance">Maintenance</a>' : ""}
      <a href="#/reports">Reports</a>
      <a href="#/transactions">Transactions</a>
      <a href="#" data-action="resetData">Reset Data</a>
      <a href="#" data-action="logout">Logout</a>
    </div>
  `;
  if (hash.startsWith("#/maintenance") && state.currentUser.role !== "admin") {
    app.innerHTML = `${nav}<div class="card error">Access denied: User cannot access Maintenance.</div>`;
    return;
  }
  if (hash.startsWith("#/maintenance")) return renderMaintenance(nav);
  if (hash.startsWith("#/reports")) return renderReports(nav);
  if (hash.startsWith("#/transactions")) return renderTransactions(nav);
  app.innerHTML = `${nav}<div class="card">Welcome to Library Management System.</div>`;
}

function renderLogin(error = "") {
  sessionInfo.textContent = "Not logged in";
  app.innerHTML = `
    <div class="card">
      <h2>Login</h2>
      <form id="loginForm">
        <div class="row">
          <div class="field"><label>Username</label><input name="username" required /></div>
          <div class="field"><label>Password</label><input type="password" name="password" required /></div>
        </div>
        <button type="submit">Login</button>
        ${error ? `<div class="error">${error}</div>` : ""}
        <div class="success">Use Shubhankit/admin123 or user/user123 ot user1/user1234</div>
      </form>
    </div>
  `;
}

function renderReports(nav) {
  recomputeMembershipStatuses();
  const available = state.books.filter((b) => b.available);
  const issued = state.books.filter((b) => !b.available);
  const activeMembers = state.memberships.filter((m) => m.status === "Active");
  const users = state.appUsers;
  const totalFineCollected = state.transactions
    .filter((t) => t.type === "return")
    .reduce((sum, t) => sum + (t.finePaidAmount || 0), 0);

  app.innerHTML = `${nav}
    <div class="card">
      <h2>Reports</h2>
      <p>Reports module accessible to Admin and User.</p>
      <div class="row">
        <div class="field"><strong>Available items</strong><div>${available.length}</div></div>
        <div class="field"><strong>Issued items</strong><div>${issued.length}</div></div>
        <div class="field"><strong>Active memberships</strong><div>${activeMembers.length}</div></div>
        <div class="field"><strong>Total users</strong><div>${users.length}</div></div>
        <div class="field"><strong>Transactions</strong><div>${state.transactions.length}</div></div>
        <div class="field"><strong>Fine collected</strong><div>${totalFineCollected}</div></div>
      </div>
    </div>
    <div class="card">
      <h3>Available Items</h3>
      ${buildTable(["Title", "Author/Creator", "Serial", "Type"], available.map((b) => [b.title, b.author, b.serialNo, b.type]))}
    </div>
    <div class="card">
      <h3>Issued Items</h3>
      ${buildTable(["Title", "Author/Creator", "Serial", "Issue Date", "Due Date"], issued.map((b) => [b.title, b.author, b.serialNo, b.issueDate || "", b.dueDate || ""]))}
    </div>
    <div class="card">
      <h3>Memberships</h3>
      ${buildTable(["Membership No", "Name", "Duration", "Start Date", "End Date", "Status"], state.memberships.map((m) => [m.membershipNo, m.name, m.duration, m.startDate || "", m.endDate || "", m.status || membershipStatus(m)]))}
    </div>
    <div class="card">
      <h3>Users</h3>
      ${buildTable(["Name", "Username", "Role"], users.map((u) => [u.name, u.username, u.role]))}
    </div>
    <div class="card">
      <h3>Transactions Log</h3>
      ${buildTable(
        ["Transaction ID", "Type", "Book", "Serial", "Issue Date", "Due Date", "Return Date", "Fine", "Handled By"],
        [...state.transactions]
          .reverse()
          .map((t) => [t.id, t.type, t.title, t.serialNo, t.issueDate || "", t.dueDate || "", t.returnDate || "", t.finePaidAmount || t.fine || 0, t.handledBy || ""])
      )}
    </div>
  `;
}

function renderMaintenance(nav) {
  const hash = window.location.hash || "#/maintenance";
  const tab = hash.split("/")[2] || "membership-add";
  const sub = `
    <div class="card nav">
      <a href="#/maintenance/membership-add">Add Membership</a>
      <a href="#/maintenance/membership-update">Update Membership</a>
      <a href="#/maintenance/book-add">Add Book</a>
      <a href="#/maintenance/book-update">Update Book</a>
      <a href="#/maintenance/user-mgmt">User Management</a>
    </div>
  `;
  let content = "";
  if (tab === "membership-update") content = maintenanceUpdateMembership();
  else if (tab === "book-add") content = maintenanceAddBook();
  else if (tab === "book-update") content = maintenanceUpdateBook();
  else if (tab === "user-mgmt") content = maintenanceUserManagement();
  else content = maintenanceAddMembership();
  app.innerHTML = `${nav}${sub}${content}`;
}

function maintenanceAddMembership(msg = "") {
  return `
    <div class="card"><h2>Add Membership</h2>
    <form id="addMembershipForm">
      <div class="row">
        <div class="field"><label>Membership No</label><input name="membershipNo" required /></div>
        <div class="field"><label>Name</label><input name="name" required /></div>
      </div>
      <div class="row">
        <label><input type="radio" name="duration" value="6m" checked /> 6 months</label>
        <label><input type="radio" name="duration" value="1y" /> 1 year</label>
        <label><input type="radio" name="duration" value="2y" /> 2 years</label>
      </div>
      <button type="submit">Confirm</button>${msg}
    </form></div>
  `;
}

function maintenanceUpdateMembership(msg = "") {
  const selected = state.memberships.find((m) => m.membershipNo === state.selectedMembershipNo) || null;
  return `
    <div class="card"><h2>Update Membership</h2>
    <form id="updateMembershipForm">
      <div class="row">
        <div class="field"><label>Membership No (required)</label><input name="membershipNo" required value="${selected?.membershipNo || ""}" /></div>
        <div class="field"><label>Name</label><input name="name" value="${selected?.name || ""}" /></div>
      </div>
      <div class="row">
        <label><input type="radio" name="actionType" value="extend6" checked /> Extend by 6 months</label>
        <label><input type="radio" name="actionType" value="cancel" /> Cancel Membership</label>
      </div>
      <div class="row">
        <div class="field"><label>Start Date</label><input value="${selected?.startDate || ""}" readonly /></div>
        <div class="field"><label>End Date</label><input value="${selected?.endDate || ""}" readonly /></div>
        <div class="field"><label>Status</label><input value="${selected?.status || ""}" readonly /></div>
      </div>
      <button type="submit">Confirm</button>${msg}
    </form></div>
  `;
}

function maintenanceAddBook(msg = "") {
  return `
    <div class="card"><h2>Add Book</h2>
    <form id="addBookForm">
      <div class="row">
        <label><input type="radio" name="itemType" value="book" checked /> Book</label>
        <label><input type="radio" name="itemType" value="movie" /> Movie</label>
      </div>
      <div class="row">
        <div class="field"><label>Title</label><input name="title" required /></div>
        <div class="field"><label>Author/Creator</label><input name="author" required /></div>
        <div class="field"><label>Serial No</label><input name="serialNo" required /></div>
      </div>
      <button type="submit">Confirm</button>${msg}
    </form></div>
  `;
}

function maintenanceUpdateBook(msg = "") {
  return `
    <div class="card"><h2>Update Book</h2>
    <form id="updateBookForm">
      <div class="row">
        <label><input type="radio" name="itemType" value="book" checked /> Book</label>
        <label><input type="radio" name="itemType" value="movie" /> Movie</label>
      </div>
      <div class="row">
        <div class="field"><label>Serial No</label><input name="serialNo" required /></div>
        <div class="field"><label>Title</label><input name="title" required /></div>
        <div class="field"><label>Author/Creator</label><input name="author" required /></div>
      </div>
      <button type="submit">Confirm</button>${msg}
    </form></div>
  `;
}

function maintenanceUserManagement(msg = "") {
  return `
    <div class="card"><h2>User Management</h2>
    <form id="userMgmtForm">
      <div class="row">
        <label><input type="radio" name="userType" value="new" checked /> New User</label>
        <label><input type="radio" name="userType" value="existing" /> Existing User</label>
      </div>
      <div class="row">
        <div class="field"><label>Name (mandatory)</label><input name="name" required /></div>
        <div class="field"><label>Username</label><input name="username" required /></div>
        <div class="field"><label>Password</label><input type="password" name="password" required /></div>
      </div>
      <button type="submit">Confirm</button>${msg}
    </form></div>
  `;
}

function renderTransactions(nav) {
  const hash = window.location.hash || "#/transactions";
  const tab = hash.split("/")[2] || "available";
  const sub = `
    <div class="card nav">
      <a href="#/transactions/available">Book Available</a>
      <a href="#/transactions/issue">Book Issue</a>
      <a href="#/transactions/return">Return Book</a>
      <a href="#/transactions/fine">Fine Pay</a>
    </div>
  `;
  let content = "";
  if (tab === "issue") content = transactionIssue();
  else if (tab === "return") content = transactionReturn();
  else if (tab === "fine") content = transactionFinePay();
  else content = transactionAvailable();
  app.innerHTML = `${nav}${sub}${content}`;
}

function transactionAvailable(msg = "", results = state.books.filter((b) => b.available)) {
  const rows = results.map((b) => `<tr>
    <td>${b.title}</td><td>${b.author}</td><td>${b.serialNo}</td>
    <td><input type="radio" name="selectedBook" value="${b.id}" ${state.selectedBookId === b.id ? "checked" : ""}></td>
  </tr>`).join("");
  const authorSet = [...new Set(state.books.map((b) => b.author))];
  return `
    <div class="card"><h2>Book Available</h2>
    <form id="availableSearchForm">
      <div class="row">
        <div class="field"><label>Book Name</label><input name="title" /></div>
        <div class="field"><label>Author</label><select name="author"><option value="">Select</option>${authorSet.map((a) => `<option value="${a}">${a}</option>`).join("")}</select></div>
      </div>
      <button type="submit">Search</button>${msg}
    </form>
    <table><thead><tr><th>Book</th><th>Author</th><th>Serial</th><th>Select</th></tr></thead><tbody>${rows || "<tr><td colspan='4'>No books found</td></tr>"}</tbody></table>
    </div>
  `;
}

function transactionIssue(msg = "") {
  const options = state.books
    .filter((b) => b.available)
    .map((b) => `<option value="${b.id}" ${state.selectedBookId === b.id ? "selected" : ""}>${b.title}</option>`)
    .join("");
  const selected = state.books.find((b) => b.id === state.selectedBookId && b.available);
  const issueDate = todayStr();
  const returnDate = selected?.issueDate ? selected.dueDate : addDays(issueDate, 15);
  return `
    <div class="card"><h2>Book Issue</h2>
    <form id="issueForm">
      <div class="row">
        <div class="field"><label>Name of Book (required)</label>
          <select name="bookId" required><option value="">Select</option>${options}</select>
        </div>
        <div class="field"><label>Author (auto, non-editable)</label><input name="author" value="${selected ? selected.author : ""}" readonly /></div>
      </div>
      <div class="row">
        <div class="field"><label>Issue Date</label><input type="date" name="issueDate" min="${todayStr()}" value="${issueDate}" required /></div>
        <div class="field"><label>Return Date</label><input type="date" name="returnDate" value="${returnDate}" required /></div>
      </div>
      <div class="row"><div class="field"><label>Remarks (optional)</label><textarea name="remarks"></textarea></div></div>
      <button type="submit">Confirm Issue</button>${msg}
    </form></div>
  `;
}

function transactionReturn(msg = "") {
  const issuedBooks = state.books.filter((b) => !b.available);
  const options = issuedBooks
    .map((b) => `<option value="${b.id}" ${state.selectedReturnBookId === b.id ? "selected" : ""}>${b.title}</option>`)
    .join("");
  const selected = state.books.find((b) => b.id === state.selectedReturnBookId && !b.available) || null;
  const activeIssue = selected ? issueTransactionForBook(selected.id) : null;
  return `
    <div class="card"><h2>Return Book</h2>
    <form id="returnForm">
      <div class="row">
        <div class="field"><label>Name of Book (required)</label><select name="bookId" required><option value="">Select</option>${options}</select></div>
        <div class="field"><label>Author (auto, non-editable)</label><input name="author" value="${selected ? selected.author : ""}" readonly /></div>
        <div class="field"><label>Serial No (mandatory)</label><input name="serialNo" required value="${selected ? selected.serialNo : ""}" /></div>
      </div>
      <div class="row">
        <div class="field"><label>Issue Date (auto, non-editable)</label><input type="date" name="issueDate" readonly value="${activeIssue?.issueDate || selected?.issueDate || ""}" /></div>
        <div class="field"><label>Return Date (editable)</label><input type="date" name="returnDate" value="${activeIssue?.dueDate || selected?.dueDate || todayStr()}" required /></div>
      </div>
      <button type="submit">Confirm Return</button>${msg}
    </form></div>
  `;
}

function transactionFinePay(msg = "") {
  const p = state.pendingReturn;
  if (!p) return `<div class="card"><h2>Fine Pay</h2><div class="error">No pending return transaction.</div></div>`;
  return `
    <div class="card"><h2>Fine Pay</h2>
    <form id="finePayForm">
      <div class="row">
        <div class="field"><label>Book</label><input value="${p.title}" readonly /></div>
        <div class="field"><label>Author</label><input value="${p.author}" readonly /></div>
        <div class="field"><label>Calculated Fine</label><input value="${p.fine}" readonly /></div>
      </div>
      <div class="row">
        <label><input type="checkbox" name="finePaid" /> Fine Paid</label>
      </div>
      <div class="row"><div class="field"><label>Remarks</label><textarea name="remarks"></textarea></div></div>
      <button type="submit">Confirm</button>${msg}
    </form></div>
  `;
}

function handleClick(e) {
  const action = e.target.dataset.action;
  if (action === "logout") {
    e.preventDefault();
    state.currentUser = null;
    window.location.hash = "";
    renderLogin();
  }
  if (action === "resetData") {
    e.preventDefault();
    resetData();
    state.selectedBookId = null;
    state.selectedReturnBookId = null;
    state.pendingReturn = null;
    render();
  }
}

function handleChange(e) {
  if (e.target.name === "selectedBook") {
    state.selectedBookId = Number(e.target.value);
  }
  if (e.target.form?.id === "updateMembershipForm" && e.target.name === "membershipNo") {
    state.selectedMembershipNo = e.target.value || null;
    render();
  }
  if (e.target.form?.id === "issueForm" && e.target.name === "bookId") {
    state.selectedBookId = Number(e.target.value) || null;
    render();
  }
  if (e.target.form?.id === "returnForm" && e.target.name === "bookId") {
    state.selectedReturnBookId = Number(e.target.value) || null;
    render();
  }
}

function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  if (form.id === "loginForm") {
    const username = fd.get("username");
    const password = fd.get("password");
    const user = state.appUsers.find((u) => u.username === username && u.password === password);
    if (!user) return renderLogin("Invalid username/password.");
    state.currentUser = user;
    window.location.hash = "#/home";
    return render();
  }
  if (form.id === "availableSearchForm") {
    const title = (fd.get("title") || "").trim().toLowerCase();
    const author = fd.get("author");
    if (!title && !author) {
      app.querySelector(".card:last-child").outerHTML = transactionAvailable('<div class="error">Make a valid selection: fill Book Name or Author.</div>');
      return;
    }
    const results = state.books.filter((b) => b.available && (!title || b.title.toLowerCase().includes(title)) && (!author || b.author === author));
    app.querySelector(".card:last-child").outerHTML = transactionAvailable('<div class="success">Search completed.</div>', results);
    return;
  }
  if (form.id === "issueForm") {
    const bookId = Number(fd.get("bookId"));
    const issueDate = fd.get("issueDate");
    const returnDate = fd.get("returnDate");
    if (!bookId || !issueDate || !returnDate) {
      app.querySelector(".card:last-child").outerHTML = transactionIssue('<div class="error">Make a valid selection for Book Issue.</div>');
      return;
    }
    if (issueDate < todayStr()) {
      app.querySelector(".card:last-child").outerHTML = transactionIssue('<div class="error">Issue Date cannot be less than today.</div>');
      return;
    }
    if (returnDate > addDays(issueDate, 15)) {
      app.querySelector(".card:last-child").outerHTML = transactionIssue('<div class="error">Return Date cannot be greater than 15 days from Issue Date.</div>');
      return;
    }
    if (returnDate < issueDate) {
      app.querySelector(".card:last-child").outerHTML = transactionIssue('<div class="error">Return Date cannot be earlier than Issue Date.</div>');
      return;
    }
    const b = state.books.find((x) => x.id === bookId);
    b.available = false;
    b.issueDate = issueDate;
    b.dueDate = returnDate;
    state.transactions.push({
      id: nextId(),
      type: "issue",
      bookId: b.id,
      title: b.title,
      author: b.author,
      serialNo: b.serialNo,
      issueDate,
      dueDate: returnDate,
      fine: 0,
      finePaidAmount: 0,
      handledBy: state.currentUser.username,
      closed: false
    });
    persist();
    app.querySelector(".card:last-child").outerHTML = transactionIssue('<div class="success">Book issued successfully.</div>');
    return;
  }
  if (form.id === "returnForm") {
    const bookId = Number(fd.get("bookId"));
    const serialNo = (fd.get("serialNo") || "").trim();
    const returnDate = fd.get("returnDate");
    const b = state.books.find((x) => x.id === bookId);
    if (!bookId || !serialNo || !returnDate || !b) {
      app.querySelector(".card:last-child").outerHTML = transactionReturn('<div class="error">Make a valid selection for Return Book.</div>');
      return;
    }
    const issueTxn = issueTransactionForBook(bookId);
    if (!issueTxn) {
      app.querySelector(".card:last-child").outerHTML = transactionReturn('<div class="error">No active issue transaction found for the selected book.</div>');
      return;
    }
    if (serialNo !== b.serialNo) {
      app.querySelector(".card:last-child").outerHTML = transactionReturn('<div class="error">Serial number does not match the selected book.</div>');
      return;
    }
    if (returnDate < issueTxn.issueDate) {
      app.querySelector(".card:last-child").outerHTML = transactionReturn('<div class="error">Return Date cannot be earlier than Issue Date.</div>');
      return;
    }
    const effectiveReturn = new Date(returnDate);
    const due = new Date(issueTxn.dueDate);
    const diffDays = Math.ceil((effectiveReturn - due) / (1000 * 60 * 60 * 24));
    const fine = diffDays > 0 ? diffDays * 10 : 0;
    state.pendingReturn = {
      bookId: b.id,
      transactionId: issueTxn.id,
      title: b.title,
      author: b.author,
      serialNo: b.serialNo,
      issueDate: issueTxn.issueDate,
      dueDate: issueTxn.dueDate,
      fine,
      returnDate
    };
    window.location.hash = "#/transactions/fine";
    render();
    return;
  }
  if (form.id === "finePayForm") {
    const finePaid = !!fd.get("finePaid");
    if (state.pendingReturn.fine > 0 && !finePaid) {
      app.querySelector(".card:last-child").outerHTML = transactionFinePay('<div class="error">Fine pending: select Fine Paid to complete transaction.</div>');
      return;
    }
    const b = state.books.find((x) => x.id === state.pendingReturn.bookId);
    b.available = true;
    delete b.issueDate;
    delete b.dueDate;
    const issueTxn = state.transactions.find((t) => t.id === state.pendingReturn.transactionId);
    if (issueTxn) issueTxn.closed = true;
    state.transactions.push({
      id: nextId(),
      type: "return",
      bookId: b.id,
      title: b.title,
      author: b.author,
      serialNo: b.serialNo,
      issueDate: state.pendingReturn.issueDate,
      dueDate: state.pendingReturn.dueDate,
      returnDate: state.pendingReturn.returnDate,
      fine: state.pendingReturn.fine,
      finePaidAmount: state.pendingReturn.fine > 0 ? state.pendingReturn.fine : 0,
      handledBy: state.currentUser.username
    });
    state.pendingReturn = null;
    persist();
    app.querySelector(".card:last-child").outerHTML = `<div class="card success">Return transaction completed successfully.</div>`;
    return;
  }
  if (form.id === "addMembershipForm") {
    const membershipNo = (fd.get("membershipNo") || "").trim();
    const name = (fd.get("name") || "").trim();
    const duration = fd.get("duration");
    if (!membershipNo || !name || !duration) {
      app.querySelector(".card:last-child").outerHTML = maintenanceAddMembership('<div class="error">All fields are mandatory.</div>');
      return;
    }
    if (state.memberships.some((m) => m.membershipNo === membershipNo)) {
      app.querySelector(".card:last-child").outerHTML = maintenanceAddMembership('<div class="error">Membership Number already exists.</div>');
      return;
    }
    state.memberships.push(createMembershipRecord({ membershipNo, name, duration }));
    recomputeMembershipStatuses();
    persist();
    app.querySelector(".card:last-child").outerHTML = maintenanceAddMembership('<div class="success">Membership added.</div>');
    return;
  }
  if (form.id === "updateMembershipForm") {
    const membershipNo = (fd.get("membershipNo") || "").trim();
    const name = (fd.get("name") || "").trim();
    const actionType = fd.get("actionType");
    if (!membershipNo) {
      app.querySelector(".card:last-child").outerHTML = maintenanceUpdateMembership('<div class="error">Membership Number is mandatory.</div>');
      return;
    }
    const m = state.memberships.find((x) => x.membershipNo === membershipNo);
    if (!m) {
      app.querySelector(".card:last-child").outerHTML = maintenanceUpdateMembership('<div class="error">Membership not found.</div>');
      return;
    }
    if (name) m.name = name;
    if (actionType === "cancel") {
      m.active = false;
      m.status = "Cancelled";
    } else {
      const baseDate = m.endDate && m.endDate > todayStr() ? m.endDate : todayStr();
      m.endDate = addMonths(baseDate, 6);
      m.active = true;
    }
    recomputeMembershipStatuses();
    persist();
    app.querySelector(".card:last-child").outerHTML = maintenanceUpdateMembership('<div class="success">Membership updated.</div>');
    return;
  }
  if (form.id === "addBookForm") {
    const itemType = fd.get("itemType");
    const title = (fd.get("title") || "").trim();
    const author = (fd.get("author") || "").trim();
    const serialNo = (fd.get("serialNo") || "").trim();
    if (!itemType || !title || !author || !serialNo) {
      app.querySelector(".card:last-child").outerHTML = maintenanceAddBook('<div class="error">Enter all details to confirm.</div>');
      return;
    }
    if (state.books.some((b) => b.serialNo === serialNo)) {
      app.querySelector(".card:last-child").outerHTML = maintenanceAddBook('<div class="error">Serial number already exists.</div>');
      return;
    }
    state.books.push({ id: nextId(), type: itemType, title, author, serialNo, available: true });
    persist();
    app.querySelector(".card:last-child").outerHTML = maintenanceAddBook('<div class="success">Item added successfully.</div>');
    return;
  }
  if (form.id === "updateBookForm") {
    const itemType = fd.get("itemType");
    const title = (fd.get("title") || "").trim();
    const author = (fd.get("author") || "").trim();
    const serialNo = (fd.get("serialNo") || "").trim();
    if (!itemType || !title || !author || !serialNo) {
      app.querySelector(".card:last-child").outerHTML = maintenanceUpdateBook('<div class="error">Enter all details to confirm.</div>');
      return;
    }
    const b = state.books.find((x) => x.serialNo === serialNo);
    if (!b) {
      app.querySelector(".card:last-child").outerHTML = maintenanceUpdateBook('<div class="error">Book not found for the serial number.</div>');
      return;
    }
    b.type = itemType;
    b.title = title;
    b.author = author;
    persist();
    app.querySelector(".card:last-child").outerHTML = maintenanceUpdateBook('<div class="success">Item updated successfully.</div>');
    return;
  }
  if (form.id === "userMgmtForm") {
    const name = (fd.get("name") || "").trim();
    const username = (fd.get("username") || "").trim();
    const password = (fd.get("password") || "").trim();
    const userType = fd.get("userType");
    if (!name || !username || !password || !userType) {
      app.querySelector(".card:last-child").outerHTML = maintenanceUserManagement('<div class="error">Name is mandatory and all fields are required.</div>');
      return;
    }
    const existing = state.appUsers.find((u) => u.username === username);
    if (userType === "new" && existing) {
      app.querySelector(".card:last-child").outerHTML = maintenanceUserManagement('<div class="error">User already exists.</div>');
      return;
    }
    if (userType === "existing" && !existing) {
      app.querySelector(".card:last-child").outerHTML = maintenanceUserManagement('<div class="error">Existing user not found.</div>');
      return;
    }
    if (userType === "new") state.appUsers.push({ username, password, role: "user", name });
    else Object.assign(existing, { name, password });
    persist();
    app.querySelector(".card:last-child").outerHTML = maintenanceUserManagement('<div class="success">User details saved.</div>');
  }
}

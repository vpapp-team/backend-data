(function() {
  this.getProfile = function(cb) {
    request('/data/profile', function(err, statusCode, body) {
      if (err) return cb(err);
      if (statusCode !== 200) return cb(new Error(`statusCode ${statusCode}`));
      try {
        this.profile = JSON.parse(body);
        return cb(null, this.profile);
      } catch (e) {
        return cb(e);
      }
    });
  };

  this.request = function(url, cb, method = 'GET', data = null) {
    let req = new XMLHttpRequest();
    req.onreadystatechange = function() {
      if (this.readyState === this.DONE) {
        try {
          const givenErr = JSON.parse(this.responseText).error;
          if (givenErr && this.status !== 200) return cb(new Error(givenErr), this.status);
        } catch (e) {}
        cb(null, this.status, this.responseText);
      }
    };
    req.open(method, url, true);
    req.send(data);
  };

  this.loadPage = function(url, cb, trys = 3) {
    if (trys === 0) return alert('failed - to many retrys');
    request(url, (err, statusCode, body) => {
      if (err || statusCode !== 200) return loadPage(url, cb, trys - 1);
      document.getElementById('page-wrapper').innerHTML = body;
      executeScripts(document.getElementById('page-wrapper'));
      if (cb) cb();
    });
  };

  this.clean = function(cb) {
    let cleanerTop = document.getElementById('cleaner-top');
    let cleanerBottom = document.getElementById('cleaner-bottom');
    activateCleanerElement(cleanerTop);
    activateCleanerElement(cleanerBottom, () => {
      document.getElementById('page-wrapper').innerHTML = '';
      if (cb) cb();
      resetCleanerElement(cleanerTop);
      resetCleanerElement(cleanerBottom);
    });
  };
  this.resetCleanerElement = function(element) {
    element.style.visibility = 'hidden';
    element.style.opacity = '0';
    element.style.height = '0vh';
  };
  this.activateCleanerElement = function(element, cb) {
    element.style.visibility = 'inherit';
    element.style.opacity = '1';
    element.style.height = '100vh';
    if (cb) setTimeout(cb, 1100);
  };

  this.initCSS = function() {
    if (!document.getElementById('headCSS')) {
      let head = document.getElementsByTagName('head')[0];
      let link = document.createElement('link');
      link.id = 'headCSS';
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = './content/style.css';
      head.appendChild(link);
    }
  };

  this.executeScripts = function(container) {
    for (const element of container.querySelectorAll('script')) {
      let s = document.createElement('script');
      s.type = 'text/javascript';
      if (element.src) s.src = element.src;
      else s.textContent = element.innerText;
      element.parentElement.replaceChild(s, element);
    }
  };

  this.registerPrevLocation = function(location) {
    window.history.pushState(null, null, location);
  };

  this.sortTable = function() {
    let n = Array.prototype.indexOf.call(this.parentNode.children, this);
    let table = this.parentNode.parentNode;
    let rows, switching, i, x, y, shouldSwitch, dir, switchcount = 0;
    switching = true;
    dir = 'asc';
    while (switching) {
      switching = false;
      rows = table.getElementsByTagName('TR');
      for (i = 1; i < (rows.length - 1); i++) {
        shouldSwitch = false;
        x = rows[i].getElementsByTagName('TD')[n];
        y = rows[i + 1].getElementsByTagName('TD')[n];
        if (dir == 'asc') {
          if (x.innerHTML.toLowerCase() > y.innerHTML.toLowerCase()) {
            shouldSwitch = true;
            break;
          }
        } else if (dir == 'desc') {
          if (x.innerHTML.toLowerCase() < y.innerHTML.toLowerCase()) {
            shouldSwitch = true;
            break;
          }
        }
      }
      if (shouldSwitch) {
        rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
        switching = true;
        switchcount++;
      } else if (switchcount == 0 && dir == 'asc') {
        dir = 'desc';
        switching = true;
      }
    }
  };

  this.init = function() {
    initCSS();
    getProfile((err, profile) => {
      if (err || profile.error) loadPage('./content/pages/login.html');
      else loadPage('./content/pages/home.html');
    });
  };
}());
init();

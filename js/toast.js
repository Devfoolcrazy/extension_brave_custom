// Bandeau de confirmation avec une action (typiquement « Annuler »).

let el;
let timer;

function build() {
  el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.hidden = true;
  el.append(document.createElement('span'), Object.assign(document.createElement('button'), { type: 'button' }));
  el.lastChild.className = 'toast__action';
}

// Une boîte de dialogue modale rend le reste de la page inerte : pour rester cliquable,
// le bandeau s'installe dans la boîte ouverte la plus récente, sinon dans la page.
function place() {
  const host = [...document.querySelectorAll('dialog[open]')].at(-1) ?? document.body;
  if (el.parentNode !== host) host.append(el);
}

function hide() {
  clearTimeout(timer);
  if (el) el.hidden = true;
}

export function toast(message, { action, onAction, duration = 7000 } = {}) {
  if (!el) {
    build();
    // « close » ne remonte pas : on l'écoute en capture pour suivre la fermeture des boîtes.
    document.addEventListener('close', () => !el.hidden && place(), true);
  }
  const [text, button] = el.children;
  text.textContent = message;
  button.hidden = !action;
  button.textContent = action ?? '';
  button.onclick = () => {
    hide();
    onAction?.();
  };
  place();
  el.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(hide, duration);
}

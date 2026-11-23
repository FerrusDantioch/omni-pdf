/* Gestion de l'historique Annuler / Rétablir (Undo / Redo) par instantanés immuables. */

function clonerAnnotations(annotations) {
  if (typeof structuredClone === 'function') {
    return structuredClone(annotations);
  }
  return JSON.parse(JSON.stringify(annotations));
}

export class HistoriqueAnnotations {
  constructor(capaciteMax = 80) {
    this.capaciteMax = capaciteMax;
    this.passe = [];
    this.courant = [];
    this.futur = [];
  }

  reinitialiser(annotations = []) {
    this.passe = [];
    this.courant = clonerAnnotations(annotations);
    this.futur = [];
  }

  enregistrer(nouvellesAnnotations) {
    this.passe.push(clonerAnnotations(this.courant));
    if (this.passe.length > this.capaciteMax) {
      this.passe.shift();
    }
    this.courant = clonerAnnotations(nouvellesAnnotations);
    this.futur = [];
  }

  peutAnnuler() {
    return this.passe.length > 0;
  }

  peutRetablir() {
    return this.futur.length > 0;
  }

  annuler() {
    if (!this.peutAnnuler()) return null;
    this.futur.push(clonerAnnotations(this.courant));
    this.courant = this.passe.pop();
    return clonerAnnotations(this.courant);
  }

  retablir() {
    if (!this.peutRetablir()) return null;
    this.passe.push(clonerAnnotations(this.courant));
    this.courant = this.futur.pop();
    return clonerAnnotations(this.courant);
  }
}

/* Modale de création / édition pour les blocs de texte et les notes / commentaires. */

export function initialiserEditeurTexte(store) {
  const modale = document.getElementById('modale-edition-texte');
  const titreModale = document.getElementById('titre-modale-edition');
  const wrapTitreNote = document.getElementById('champ-titre-note-wrap');
  const inputTitreNote = document.getElementById('input-titre-note');
  const inputContenu = document.getElementById('input-contenu-texte');
  const wrapTailleTexte = document.getElementById('champ-taille-texte-wrap');
  const selectTaille = document.getElementById('select-taille-texte-edition');
  const btnSupprimer = document.getElementById('btn-supprimer-edition');
  const btnAnnuler = document.getElementById('btn-annuler-edition');
  const btnValider = document.getElementById('btn-valider-edition');
  const btnFermer = document.getElementById('btn-fermer-edition');

  let contexteEdition = null;

  function fermer() {
    contexteEdition = null;
    if (modale.open) modale.close();
  }

  function valider() {
    if (!contexteEdition) return;
    const { mode, annotation } = contexteEdition;
    const contenu = inputContenu.value.trim();

    if (!contenu) {
      if (mode === 'modifier') {
        store.supprimerAnnotation(annotation.id);
      }
      fermer();
      return;
    }

    if (annotation.type === 'note') {
      const champs = {
        titre: inputTitreNote.value.trim(),
        contenu
      };
      if (mode === 'creer') {
        store.ajouterAnnotation({ ...annotation, ...champs }, true);
      } else {
        store.modifierAnnotation(annotation.id, champs, true);
      }
    } else {
      const taillePolice = Number(selectTaille.value) || 18;
      const champs = {
        contenu,
        taillePolice
      };
      if (mode === 'creer') {
        store.ajouterAnnotation({ ...annotation, ...champs }, true);
      } else {
        store.modifierAnnotation(annotation.id, champs, true);
      }
    }

    fermer();
  }

  btnValider.addEventListener('click', valider);
  btnAnnuler.addEventListener('click', fermer);
  btnFermer.addEventListener('click', fermer);
  btnSupprimer.addEventListener('click', () => {
    if (contexteEdition?.mode === 'modifier') {
      store.supprimerAnnotation(contexteEdition.annotation.id);
    }
    fermer();
  });

  modale.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      valider();
    }
  });

  return {
    ouvrir({ mode, annotation }) {
      contexteEdition = { mode, annotation };
      const estNote = annotation.type === 'note';

      titreModale.textContent =
        mode === 'creer'
          ? estNote
            ? 'Nouvelle note'
            : 'Nouveau bloc de texte'
          : estNote
            ? 'Modifier la note'
            : 'Modifier le texte';

      wrapTitreNote.classList.toggle('cache', !estNote);
      wrapTailleTexte.classList.toggle('cache', estNote);
      btnSupprimer.classList.toggle('cache', mode === 'creer');

      inputTitreNote.value = annotation.titre || '';
      inputContenu.value = annotation.contenu || '';
      selectTaille.value = String(annotation.taillePolice || store.etat.outil.taillePolice || 18);

      modale.showModal();
      setTimeout(() => inputContenu.focus(), 30);
    }
  };
}

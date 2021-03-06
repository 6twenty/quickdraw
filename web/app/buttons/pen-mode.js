class PenMode extends Button {

  constructor(app) {
    super(app)

    this.title = 'Mode'

    this.on('pen:change', this.update)
  }

  render() {
    this.el = document.createElement('div')

    this.el.id = 'pen-mode'
    this.el.classList.add('button')

    this.update({ mode: 'draw' })

    this.app.el.appendChild(this.el)
  }

  click() {
    if (this.app.pen.mode === 'draw') {
      this.app.pen.mode = 'erase'
    } else if (this.app.pen.mode === 'erase') {
      this.app.pen.mode = 'draw'
    }
  }

  update(attrs) {
    if (attrs.mode === 'draw') {
      this.el.classList.remove('erase-mode')
      this.el.classList.add('draw-mode')
    } else if (attrs.mode === 'erase') {
      this.el.classList.remove('draw-mode')
      this.el.classList.add('erase-mode')
    }
  }

}

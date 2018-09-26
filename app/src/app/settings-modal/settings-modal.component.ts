import { Component, OnInit, Input } from "@angular/core";


@Component({
  selector: "settings-modal",
  templateUrl: './settings-modal.component.html'

})
export class SettingsModalComponent {
  @Input() name;

  constructor() { }
}

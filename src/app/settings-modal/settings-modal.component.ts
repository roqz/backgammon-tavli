import { Component, OnInit, Input } from "@angular/core";
import { NgbModal, NgbActiveModal } from "@ng-bootstrap/ng-bootstrap";


@Component({
  selector: "settings-modal",
  templateUrl: './settings-modal.component.html'

})
export class SettingsModalComponent {
  @Input() name;

  constructor(public activeModal: NgbActiveModal) { }
}

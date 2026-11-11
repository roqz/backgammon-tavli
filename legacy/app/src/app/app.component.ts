import { ChangeDetectorRef, Component, Renderer } from "@angular/core";
import { Store } from "@ngrx/store";
import { State } from "./reducers";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"]
})
export class AppComponent {

  title = "Backgammon Tavli";
  inputValue: string;

  constructor(public renderer: Renderer, private cdRef: ChangeDetectorRef, private store: Store<State>) {

  }

  /* UI  */


  async inputButtonClick(val: string) {
    console.log("click " + val);
  }

}

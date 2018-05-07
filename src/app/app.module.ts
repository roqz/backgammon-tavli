import { BrowserModule } from "@angular/platform-browser";
import { NgModule, NO_ERRORS_SCHEMA } from "@angular/core";


import { AppComponent } from "./app.component";
import { DiceComponent } from "./components/dice.component";


@NgModule({
  declarations: [
    AppComponent,
    DiceComponent
  ],
  imports: [
    BrowserModule
  ],
  providers: [],
  bootstrap: [AppComponent],
  schemas: [NO_ERRORS_SCHEMA]

})
export class AppModule { }
